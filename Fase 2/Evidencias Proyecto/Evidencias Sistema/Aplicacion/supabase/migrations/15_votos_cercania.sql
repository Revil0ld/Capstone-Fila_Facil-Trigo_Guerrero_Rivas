BEGIN;

-- 1. Votar solo estando dentro del supermercado -------------------------------------------

DROP FUNCTION IF EXISTS public.registrar_voto_supermercado(uuid, uuid, smallint);

CREATE FUNCTION public.registrar_voto_supermercado(
  p_id_super uuid,
  p_id_filtro uuid,
  p_voto smallint,
  p_latitud numeric,
  p_longitud numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid;
  v_filter_type text;
  v_distance_meters double precision;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para votar.';
  END IF;

  IF p_id_super IS NULL OR p_id_filtro IS NULL OR p_voto IS NULL OR p_voto NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'El voto debe ser positivo o negativo.';
  END IF;

  IF p_latitud IS NULL OR p_longitud IS NULL
    OR p_latitud < -90 OR p_latitud > 90
    OR p_longitud < -180 OR p_longitud > 180
  THEN
    RAISE EXCEPTION 'Necesitamos tu ubicación para confirmar que estás dentro del supermercado.';
  END IF;

  SELECT usuario_row.id_usuario
  INTO v_usuario_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid()
    AND NOT usuario_row.cuenta_baneada;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta no tiene permiso para votar.';
  END IF;

  SELECT filtro_row.tipo
  INTO v_filter_type
  FROM public.filtro_super AS filtro_link
  JOIN public.filtro AS filtro_row
    ON filtro_row.id_filtro = filtro_link.id_filtro
  JOIN public.super AS super_row
    ON super_row.id_super = filtro_link.id_super
    AND super_row.catalogo_activo
  WHERE filtro_link.id_super = p_id_super
    AND filtro_link.id_filtro = p_id_filtro;

  IF v_filter_type IS NULL THEN
    RAISE EXCEPTION 'El criterio no está asociado a este supermercado.';
  END IF;

  SELECT
    2 * 6371000 * pg_catalog.asin(
      pg_catalog.sqrt(
        pg_catalog.power(pg_catalog.sin(pg_catalog.radians(
          (address_row.latitu::double precision - p_latitud::double precision) / 2
        )), 2)
        + pg_catalog.cos(pg_catalog.radians(p_latitud::double precision))
          * pg_catalog.cos(pg_catalog.radians(address_row.latitu::double precision))
          * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(
            (address_row.longitu::double precision - p_longitud::double precision) / 2
          )), 2)
      )
    )
  INTO v_distance_meters
  FROM public.super AS super_row
  JOIN public.direccion_super AS address_row
    ON address_row.id_direccion_s = super_row.id_direccion_s
  WHERE super_row.id_super = p_id_super;

  IF v_distance_meters IS NULL OR v_distance_meters > 150 THEN
    RAISE EXCEPTION 'Solo puedes votar cuando estás dentro del supermercado como cliente.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_usuario_id::text || ':' || p_id_super::text || ':' || p_id_filtro::text,
      0
    )
  );

  UPDATE public.voto_filtro
  SET valor_voto = p_voto, fecha_hora = pg_catalog.now()
  WHERE id_usuario = v_usuario_id
    AND id_super = p_id_super
    AND id_filtro = p_id_filtro;

  IF NOT FOUND THEN
    INSERT INTO public.voto_filtro (
      id_usuario,
      id_super,
      id_filtro,
      valor_voto,
      fecha_hora
    )
    VALUES (
      v_usuario_id,
      p_id_super,
      p_id_filtro,
      p_voto,
      pg_catalog.now()
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_voto_supermercado(uuid, uuid, smallint, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_voto_supermercado(uuid, uuid, smallint, numeric, numeric)
  TO authenticated;

-- 2. Baneos temporales ---------------------------------------------------------------------

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS baneo_hasta timestamptz;

CREATE OR REPLACE FUNCTION public.liberar_baneos_vencidos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.usuario AS usuario_row
  SET cuenta_baneada = false, baneo_hasta = NULL
  WHERE usuario_row.baneo_hasta IS NOT NULL
    AND usuario_row.baneo_hasta <= pg_catalog.now();
$$;

REVOKE ALL ON FUNCTION public.liberar_baneos_vencidos() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obtener_estado_acceso()
RETURNS TABLE (
  es_admin boolean,
  cuenta_baneada boolean,
  chat_baneado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;

  PERFORM public.liberar_baneos_vencidos();

  RETURN QUERY
  SELECT
    usuario_row.rol = 'admin',
    usuario_row.cuenta_baneada,
    usuario_row.chat_baneado
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el perfil asociado a esta cuenta.';
  END IF;
END;
$$;

-- El baneo permanente limpia cualquier fecha de término previa.
CREATE OR REPLACE FUNCTION public.actualizar_sancion_usuario_admin(
  p_id_usuario uuid,
  p_cuenta_baneada boolean,
  p_chat_baneado boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_id uuid;
  v_role text;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para administrar usuarios.';
  END IF;
  IF p_id_usuario IS NULL
    OR p_cuenta_baneada IS NULL
    OR p_chat_baneado IS NULL
  THEN
    RAISE EXCEPTION 'La sanción solicitada no es válida.';
  END IF;

  SELECT usuario_row.auth_id, usuario_row.rol
  INTO v_auth_id, v_role
  FROM public.usuario AS usuario_row
  WHERE usuario_row.id_usuario = p_id_usuario
  FOR UPDATE;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta solicitada.';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'No se puede sancionar una cuenta administradora.';
  END IF;

  UPDATE public.usuario AS usuario_row
  SET
    cuenta_baneada = p_cuenta_baneada,
    chat_baneado = p_chat_baneado,
    baneo_hasta = NULL
  WHERE usuario_row.id_usuario = p_id_usuario;

  UPDATE auth.users AS auth_user
  SET banned_until = CASE
    WHEN p_cuenta_baneada THEN '9999-12-31 23:59:59+00'::timestamptz
    ELSE NULL
  END
  WHERE auth_user.id = v_auth_id;

  IF p_cuenta_baneada THEN
    DELETE FROM auth.sessions AS auth_session
    WHERE auth_session.user_id = v_auth_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.banear_cuenta_temporal_admin(
  p_id_usuario uuid,
  p_horas integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_id uuid;
  v_role text;
  v_until timestamptz;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para administrar usuarios.';
  END IF;
  IF p_id_usuario IS NULL OR p_horas IS NULL OR p_horas < 1 OR p_horas > 24 * 365 THEN
    RAISE EXCEPTION 'La duración del baneo no es válida.';
  END IF;

  SELECT usuario_row.auth_id, usuario_row.rol
  INTO v_auth_id, v_role
  FROM public.usuario AS usuario_row
  WHERE usuario_row.id_usuario = p_id_usuario
  FOR UPDATE;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta solicitada.';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'No se puede sancionar una cuenta administradora.';
  END IF;

  v_until := pg_catalog.now() + pg_catalog.make_interval(hours => p_horas);

  UPDATE public.usuario AS usuario_row
  SET cuenta_baneada = true, baneo_hasta = v_until
  WHERE usuario_row.id_usuario = p_id_usuario;

  UPDATE auth.users AS auth_user
  SET banned_until = v_until
  WHERE auth_user.id = v_auth_id;

  DELETE FROM auth.sessions AS auth_session
  WHERE auth_session.user_id = v_auth_id;

  RETURN v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_estado_acceso()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_sancion_usuario_admin(uuid, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.banear_cuenta_temporal_admin(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_estado_acceso() TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_sancion_usuario_admin(uuid, boolean, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.banear_cuenta_temporal_admin(uuid, integer)
  TO authenticated;

-- 3. Tabla de usuarios del panel de administración -----------------------------------------

DROP FUNCTION IF EXISTS public.obtener_usuarios_admin();

CREATE FUNCTION public.obtener_usuarios_admin()
RETURNS TABLE (
  id_usuario uuid,
  nombre text,
  correo text,
  telefono text,
  rol text,
  cuenta_baneada boolean,
  chat_baneado boolean,
  baneo_hasta timestamptz,
  mensaje_reportado text,
  id_super_reporte uuid,
  nombre_super_reporte text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para administrar usuarios.';
  END IF;

  PERFORM public.liberar_baneos_vencidos();

  RETURN QUERY
  SELECT
    usuario_row.id_usuario,
    usuario_row.nombre::text,
    auth_user.email::text,
    usuario_row.telefono::text,
    usuario_row.rol::text,
    usuario_row.cuenta_baneada,
    usuario_row.chat_baneado,
    usuario_row.baneo_hasta,
    last_report.mensaje_reportado::text,
    last_report.id_super,
    last_report.nombre_supermercado::text
  FROM public.usuario AS usuario_row
  JOIN auth.users AS auth_user
    ON auth_user.id = usuario_row.auth_id
  LEFT JOIN LATERAL (
    SELECT
      report_row.mensaje_reportado,
      report_row.nombre_supermercado,
      COALESCE(
        chat_row.id_super,
        (
          SELECT super_row.id_super
          FROM public.super AS super_row
          WHERE super_row.nombre = report_row.nombre_supermercado
          ORDER BY super_row.catalogo_activo DESC, super_row.id_super
          LIMIT 1
        )
      ) AS id_super
    FROM public.chat_reporte_usuario AS report_row
    LEFT JOIN public.chat_mensaje_supermercado AS chat_row
      ON chat_row.id_mensaje = report_row.id_mensaje
    WHERE report_row.id_reportado = usuario_row.id_usuario
      AND report_row.resuelto_en IS NULL
    ORDER BY report_row.creado_en DESC
    LIMIT 1
  ) AS last_report ON true
  ORDER BY usuario_row.nombre, auth_user.email
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_usuarios_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_usuarios_admin() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
