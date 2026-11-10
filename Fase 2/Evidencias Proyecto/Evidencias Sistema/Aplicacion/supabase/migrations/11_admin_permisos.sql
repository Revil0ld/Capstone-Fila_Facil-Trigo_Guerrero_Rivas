BEGIN;

ALTER TABLE public.super
  ADD COLUMN IF NOT EXISTS catalogo_activo boolean NOT NULL DEFAULT true;

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS cuenta_baneada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_baneado boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.obtener_estado_acceso()
RETURNS TABLE (
  es_admin boolean,
  cuenta_baneada boolean,
  chat_baneado boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;

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

CREATE OR REPLACE FUNCTION public.sincronizar_supermercados_osm(p_supermercados jsonb)
RETURNS TABLE (osm_ref text, id_super uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store jsonb;
  v_activo boolean;
  v_osm_ref text;
  v_super_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para sincronizar supermercados.';
  END IF;
  IF pg_catalog.jsonb_typeof(p_supermercados) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La lista de supermercados recibida no es válida.';
  END IF;

  FOR v_store IN
    SELECT store_data.value
    FROM pg_catalog.jsonb_array_elements(p_supermercados) AS store_data(value)
  LOOP
    v_osm_ref := v_store ->> 'osmRef';
    v_super_id := public.sincronizar_supermercado_osm(
      v_osm_ref,
      v_store ->> 'name',
      v_store ->> 'chain',
      v_store ->> 'region',
      v_store ->> 'comuna',
      v_store ->> 'street',
      (v_store ->> 'latitude')::numeric,
      (v_store ->> 'longitude')::numeric
    );

    SELECT super_row.catalogo_activo
    INTO v_activo
    FROM public.super AS super_row
    WHERE super_row.id_super = v_super_id;

    IF v_activo THEN
      osm_ref := v_osm_ref;
      id_super := v_super_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_resumen_admin()
RETURNS TABLE (
  total_usuarios bigint,
  total_supermercados bigint,
  mensajes_chat bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para consultar el panel de administración.';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT pg_catalog.count(*) FROM public.usuario),
    (SELECT pg_catalog.count(*) FROM public.super WHERE catalogo_activo),
    (SELECT pg_catalog.count(*) FROM public.chat_mensaje_supermercado);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_catalogo_admin()
RETURNS TABLE (
  id_super uuid,
  nombre text,
  cadena text,
  region text,
  comuna text,
  calle text,
  osm_ref text,
  activo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para administrar el catálogo.';
  END IF;

  RETURN QUERY
  SELECT
    super_row.id_super,
    super_row.nombre::text,
    super_row.tipo::text,
    address_row.region::text,
    address_row.comuna::text,
    address_row.calle::text,
    super_row.osm_ref,
    super_row.catalogo_activo
  FROM public.super AS super_row
  LEFT JOIN public.direccion_super AS address_row
    ON address_row.id_direccion_s = super_row.id_direccion_s
  ORDER BY super_row.catalogo_activo DESC, super_row.tipo, super_row.nombre;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_catalogo_admin(
  p_id_super uuid,
  p_activo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_count bigint;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para modificar el catálogo.';
  END IF;
  IF p_id_super IS NULL OR p_activo IS NULL THEN
    RAISE EXCEPTION 'El supermercado o el estado solicitado no son válidos.';
  END IF;

  UPDATE public.super AS super_row
  SET catalogo_activo = p_activo
  WHERE super_row.id_super = p_id_super;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'No se encontró el supermercado solicitado.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_supermercado_admin(p_id_super uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_address_id uuid;
  v_deleted_count bigint;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar supermercados.';
  END IF;
  IF p_id_super IS NULL THEN
    RAISE EXCEPTION 'El identificador del supermercado no es válido.';
  END IF;

  SELECT super_row.id_direccion_s
  INTO v_address_id
  FROM public.super AS super_row
  WHERE super_row.id_super = p_id_super
  FOR UPDATE;

  IF v_address_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el supermercado solicitado.';
  END IF;

  DELETE FROM public.voto_filtro AS vote_row WHERE vote_row.id_super = p_id_super;
  DELETE FROM public.filtro_super AS filter_row WHERE filter_row.id_super = p_id_super;
  DELETE FROM public.super_usuario_presencia AS presence_row
    WHERE presence_row.id_super = p_id_super;
  DELETE FROM public.chat_mensaje_supermercado AS chat_row
    WHERE chat_row.id_super = p_id_super;
  DELETE FROM public.super AS super_row WHERE super_row.id_super = p_id_super;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No se pudo eliminar el supermercado solicitado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.super AS remaining_store
    WHERE remaining_store.id_direccion_s = v_address_id
  ) THEN
    DELETE FROM public.direccion_super AS address_row
    WHERE address_row.id_direccion_s = v_address_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_usuarios_admin()
RETURNS TABLE (
  id_usuario uuid,
  nombre text,
  correo text,
  rol text,
  cuenta_baneada boolean,
  chat_baneado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para administrar usuarios.';
  END IF;

  RETURN QUERY
  SELECT
    usuario_row.id_usuario,
    usuario_row.nombre::text,
    auth_user.email::text,
    usuario_row.rol::text,
    usuario_row.cuenta_baneada,
    usuario_row.chat_baneado
  FROM public.usuario AS usuario_row
  JOIN auth.users AS auth_user
    ON auth_user.id = usuario_row.auth_id
  ORDER BY usuario_row.nombre, auth_user.email
  LIMIT 1000;
END;
$$;

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
    chat_baneado = p_chat_baneado
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

CREATE OR REPLACE FUNCTION public.enviar_mensaje_supermercado(
  p_id_super uuid,
  p_mensaje text
)
RETURNS TABLE (
  id_mensaje bigint,
  mensaje text,
  creado_en timestamptz,
  nombre_usuario text,
  es_mio boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid;
  v_chat_baneado boolean;
  v_mensaje_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para enviar mensajes.';
  END IF;
  IF p_id_super IS NULL
    OR NULLIF(pg_catalog.btrim(p_mensaje), '') IS NULL
    OR pg_catalog.char_length(pg_catalog.btrim(p_mensaje)) > 500
  THEN
    RAISE EXCEPTION 'El mensaje debe contener entre 1 y 500 caracteres.';
  END IF;

  SELECT usuario_row.id_usuario, usuario_row.chat_baneado
  INTO v_usuario_id, v_chat_baneado
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid()
    AND NOT usuario_row.cuenta_baneada;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta no tiene permiso para usar la aplicación.';
  END IF;
  IF v_chat_baneado THEN
    RAISE EXCEPTION 'Tu cuenta tiene restringido el envío de mensajes en los chats.';
  END IF;

  INSERT INTO public.chat_mensaje_supermercado AS inserted_row (
    id_super,
    id_usuario,
    mensaje
  )
  VALUES (
    p_id_super,
    v_usuario_id,
    pg_catalog.btrim(p_mensaje)
  )
  RETURNING inserted_row.id_mensaje INTO v_mensaje_id;

  RETURN QUERY
  SELECT
    chat_row.id_mensaje,
    chat_row.mensaje,
    chat_row.creado_en,
    usuario_row.nombre::text,
    true
  FROM public.chat_mensaje_supermercado AS chat_row
  JOIN public.usuario AS usuario_row
    ON usuario_row.id_usuario = chat_row.id_usuario
  WHERE chat_row.id_mensaje = v_mensaje_id;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_estado_acceso()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_catalogo_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_estado_catalogo_admin(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_supermercado_admin(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_usuarios_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_sancion_usuario_admin(uuid, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enviar_mensaje_supermercado(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_estado_acceso()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_catalogo_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_catalogo_admin(uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_supermercado_admin(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_usuarios_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_sancion_usuario_admin(uuid, boolean, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_mensaje_supermercado(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
