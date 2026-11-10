--
-- PostgreSQL database dump
--

\restrict yIznI7n8n8Npxat9tv1D5RZdKOs6iU2sdn12BWU6BZ2EwSdWPOSDzeXx0doWepf

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: actualizar_estado_catalogo_admin(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_estado_catalogo_admin(p_id_super uuid, p_activo boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: actualizar_perfil_cuenta(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_perfil_cuenta(p_nombre text, p_telefono text, p_region text, p_comuna text, p_calle text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_direccion_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para actualizar tu perfil.';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_nombre), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_telefono), '') IS NULL
    OR p_telefono !~ '^[0-9]{9}$'
    OR NULLIF(pg_catalog.btrim(p_region), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_comuna), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_calle), '') IS NULL
  THEN
    RAISE EXCEPTION 'Completa todos los datos y escribe un teléfono válido de 9 dígitos.';
  END IF;

  UPDATE public.usuario AS usuario_row
  SET
    nombre = pg_catalog.btrim(p_nombre),
    telefono = pg_catalog.btrim(p_telefono)
  WHERE usuario_row.auth_id = auth.uid()
  RETURNING usuario_row.id_direccion INTO v_direccion_id;

  IF v_direccion_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un perfil asociado a tu cuenta.';
  END IF;

  UPDATE public.direccion_usuario
  SET
    region = pg_catalog.btrim(p_region),
    comuna = pg_catalog.btrim(p_comuna),
    calle = pg_catalog.btrim(p_calle)
  WHERE id_direccion = v_direccion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la dirección asociada a tu perfil.';
  END IF;
END;
$_$;


--
-- Name: actualizar_presencia_por_ubicacion(numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_presencia_por_ubicacion(p_latitud numeric, p_longitud numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_super_id uuid;
  v_old_super_ids uuid[];
  v_affected_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para actualizar tu presencia.';
  END IF;

  SELECT usuario_row.id_usuario
  INTO v_user_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu perfil de usuario para actualizar tu presencia.';
  END IF;

  IF (p_latitud IS NULL) <> (p_longitud IS NULL) THEN
    RAISE EXCEPTION 'Debes enviar ambas coordenadas o ninguna para salir de todos los supermercados.';
  END IF;
  IF p_latitud IS NOT NULL AND (
    p_latitud < -90 OR p_latitud > 90 OR p_longitud < -180 OR p_longitud > 180
  ) THEN
    RAISE EXCEPTION 'Las coordenadas recibidas están fuera del rango permitido.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('super-presence:' || v_user_id::text, 0)
  );

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT presence.id_super), ARRAY[]::uuid[])
  INTO v_old_super_ids
  FROM public.super_usuario_presencia AS presence
  WHERE presence.id_usuario = v_user_id;

  DELETE FROM public.super_usuario_presencia AS presence
  WHERE presence.actualizado_en <= pg_catalog.now() - interval '5 minutes'
     OR presence.id_usuario = v_user_id;

  IF p_latitud IS NOT NULL THEN
    SELECT store.id_super
    INTO v_super_id
    FROM (
      SELECT
        super_row.id_super,
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
        ) AS distance_meters
      FROM public.super AS super_row
      JOIN public.direccion_super AS address_row
        ON address_row.id_direccion_s = super_row.id_direccion_s
      WHERE pg_catalog.abs(address_row.latitu::double precision - p_latitud::double precision)
          <= 100.0 / 110574.0
        AND pg_catalog.abs(address_row.longitu::double precision - p_longitud::double precision)
          <= 100.0 / (
            111320.0 * greatest(
              0.01,
              pg_catalog.abs(pg_catalog.cos(pg_catalog.radians(p_latitud::double precision)))
            )
          )
    ) AS store
    WHERE store.distance_meters <= 100
    ORDER BY store.distance_meters, store.id_super
    LIMIT 1;

    IF v_super_id IS NOT NULL THEN
      INSERT INTO public.super_usuario_presencia (id_usuario, id_super, actualizado_en)
      VALUES (v_user_id, v_super_id, pg_catalog.now());
    END IF;
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT affected.id_super),
    ARRAY[]::uuid[]
  )
  INTO v_affected_ids
  FROM (
    SELECT pg_catalog.unnest(v_old_super_ids) AS id_super
    UNION
    SELECT v_super_id WHERE v_super_id IS NOT NULL
  ) AS affected;

  IF pg_catalog.cardinality(v_affected_ids) > 0 THEN
    PERFORM * FROM public.obtener_aforo_supermercados(v_affected_ids);
  END IF;

  RETURN v_super_id;
END;
$$;


--
-- Name: actualizar_sancion_usuario_admin(uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_sancion_usuario_admin(p_id_usuario uuid, p_cuenta_baneada boolean, p_chat_baneado boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: banear_cuenta_temporal_admin(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.banear_cuenta_temporal_admin(p_id_usuario uuid, p_horas integer) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: eliminar_mensaje_admin(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eliminar_mensaje_admin(p_id_mensaje bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_deleted_count bigint;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar mensajes del chat.';
  END IF;
  IF p_id_mensaje IS NULL OR p_id_mensaje <= 0 THEN
    RAISE EXCEPTION 'El identificador del mensaje no es válido.';
  END IF;

  DELETE FROM public.chat_mensaje_supermercado AS chat_row
  WHERE chat_row.id_mensaje = p_id_mensaje;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No se encontró el mensaje que quieres eliminar.';
  END IF;
END;
$$;


--
-- Name: eliminar_mensajes_reportado_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eliminar_mensajes_reportado_admin(p_id_usuario uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_admin_id uuid;
  v_target_role text;
  v_reporter_count bigint;
  v_deleted_count integer;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para moderar mensajes reportados.';
  END IF;
  IF p_id_usuario IS NULL THEN
    RAISE EXCEPTION 'El usuario seleccionado no es válido.';
  END IF;

  SELECT usuario_row.id_usuario
  INTO v_admin_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid();

  SELECT usuario_row.rol
  INTO v_target_role
  FROM public.usuario AS usuario_row
  WHERE usuario_row.id_usuario = p_id_usuario
  FOR UPDATE;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'No se encontró al usuario reportado.';
  END IF;
  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'No se pueden borrar mensajes de una cuenta administradora.';
  END IF;

  SELECT pg_catalog.count(DISTINCT report_row.id_reportante)
  INTO v_reporter_count
  FROM public.chat_reporte_usuario AS report_row
  WHERE report_row.id_reportado = p_id_usuario
    AND report_row.resuelto_en IS NULL;

  IF v_reporter_count < 5 THEN
    RAISE EXCEPTION 'Se necesitan al menos 5 reportantes distintos para esta acción.';
  END IF;

  DELETE FROM public.chat_mensaje_supermercado AS chat_row
  WHERE chat_row.id_usuario = p_id_usuario;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  UPDATE public.chat_reporte_usuario AS report_row
  SET
    resuelto_en = pg_catalog.now(),
    resuelto_por = v_admin_id
  WHERE report_row.id_reportado = p_id_usuario
    AND report_row.resuelto_en IS NULL;

  RETURN v_deleted_count;
END;
$$;


--
-- Name: eliminar_supermercado_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eliminar_supermercado_admin(p_id_super uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_address_id uuid;
  v_osm_ref text;
  v_deleted_count bigint;
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar supermercados.';
  END IF;
  IF p_id_super IS NULL THEN
    RAISE EXCEPTION 'El identificador del supermercado no es válido.';
  END IF;

  SELECT super_row.id_direccion_s, super_row.osm_ref
  INTO v_address_id, v_osm_ref
  FROM public.super AS super_row
  WHERE super_row.id_super = p_id_super
  FOR UPDATE;

  IF v_address_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el supermercado solicitado.';
  END IF;

  IF v_osm_ref IS NOT NULL THEN
    INSERT INTO public.supermercado_catalogo_excluido (osm_ref)
    VALUES (v_osm_ref)
    ON CONFLICT (osm_ref) DO NOTHING;
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


--
-- Name: enviar_mensaje_supermercado(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enviar_mensaje_supermercado(p_id_super uuid, p_mensaje text) RETURNS TABLE(id_mensaje bigint, mensaje text, creado_en timestamp with time zone, nombre_usuario text, es_mio boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: es_superusuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_superusuario() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario AS usuario_row
    WHERE usuario_row.auth_id = auth.uid()
      AND usuario_row.rol = 'admin'
  );
$$;


--
-- Name: fila_facil_assign_initial_superuser(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fila_facil_assign_initial_superuser() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, ''))) = 'filafacil.org@gmail.com' THEN
    UPDATE public.usuario AS usuario_row
    SET rol = 'admin'
    WHERE usuario_row.auth_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fila_facil_create_user_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fila_facil_create_user_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  profile_name text;
  profile_phone text;
  profile_region text;
  profile_comuna text;
  profile_calle text;
  profile_latitude numeric;
  profile_longitude numeric;
  profile_range_id uuid;
  profile_range_count bigint;
  profile_address_id uuid;
  profile_location_id uuid;
BEGIN
  IF NEW.raw_user_meta_data ->> 'fila_facil_registration' IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;

  profile_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), '');
  profile_phone := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), '');
  profile_region := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'region'), '');
  profile_comuna := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'comuna'), '');
  profile_calle := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'calle'), '');

  IF NEW.email IS NULL
    OR profile_name IS NULL
    OR profile_phone IS NULL
    OR profile_phone !~ '^[0-9]{9}$'
    OR profile_region IS NULL
    OR profile_comuna IS NULL
    OR profile_calle IS NULL
  THEN
    RAISE EXCEPTION 'Faltan datos requeridos para crear el perfil de Fila Fácil.';
  END IF;

  BEGIN
    profile_latitude := (NEW.raw_user_meta_data ->> 'latitude')::numeric;
    profile_longitude := (NEW.raw_user_meta_data ->> 'longitude')::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Las coordenadas recibidas no son válidas.';
  END;

  IF profile_latitude IS NULL
    OR profile_latitude < -90
    OR profile_latitude > 90
    OR profile_longitude IS NULL
    OR profile_longitude < -180
    OR profile_longitude > 180
  THEN
    RAISE EXCEPTION 'Las coordenadas recibidas están fuera del rango permitido.';
  END IF;

  SELECT COUNT(*), (ARRAY_AGG(range_row.id_rango))[1]
  INTO profile_range_count, profile_range_id
  FROM public.rango AS range_row
  WHERE LOWER(BTRIM(range_row.nombre)) = 'bronce'
    AND range_row.puntaje_req = 10;

  IF profile_range_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente un rango Bronce con 10 puntos; se encontraron %.',
      profile_range_count;
  END IF;

  INSERT INTO public.direccion_usuario (region, comuna, calle)
  VALUES (profile_region, profile_comuna, profile_calle)
  RETURNING id_direccion INTO profile_address_id;

  INSERT INTO public.ubi_usuario (latitu, longitu, tiempo)
  VALUES (profile_latitude, profile_longitude, NOW())
  RETURNING id_ubi INTO profile_location_id;

  INSERT INTO public.usuario (
    auth_id,
    nombre,
    correo,
    telefono,
    id_rango,
    id_direccion,
    id_ubi
  )
  VALUES (
    NEW.id,
    profile_name,
    NEW.email,
    profile_phone,
    profile_range_id,
    profile_address_id,
    profile_location_id
  );

  RETURN NEW;
END;
$_$;


--
-- Name: liberar_baneos_vencidos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liberar_baneos_vencidos() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  UPDATE public.usuario AS usuario_row
  SET cuenta_baneada = false, baneo_hasta = NULL
  WHERE usuario_row.baneo_hasta IS NOT NULL
    AND usuario_row.baneo_hasta <= pg_catalog.now();
$$;


--
-- Name: obtener_aforo_supermercados(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_aforo_supermercados(p_ids_super uuid[]) RETURNS TABLE(id_super uuid, cantidad integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_verde uuid;
  v_amarillo uuid;
  v_naranjo uuid;
  v_rojo uuid;
  v_negro uuid;
  v_row record;
  v_percentage integer;
  v_state_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para consultar el aforo.';
  END IF;

  SELECT estado_row.id_estado INTO v_verde
  FROM public.estado AS estado_row
  WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = 'verde';
  SELECT estado_row.id_estado INTO v_amarillo
  FROM public.estado AS estado_row
  WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = 'amarillo';
  SELECT estado_row.id_estado INTO v_naranjo
  FROM public.estado AS estado_row
  WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) IN ('naranjo', 'naranja')
  ORDER BY (pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = 'naranjo') DESC
  LIMIT 1;
  SELECT estado_row.id_estado INTO v_rojo
  FROM public.estado AS estado_row
  WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = 'rojo';
  SELECT estado_row.id_estado INTO v_negro
  FROM public.estado AS estado_row
  WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = 'negro';

  IF v_verde IS NULL OR v_amarillo IS NULL OR v_naranjo IS NULL
    OR v_rojo IS NULL OR v_negro IS NULL
  THEN
    RAISE EXCEPTION 'Faltan categorías de aforo compartidas; ejecuta la migración shared_occupancy_states.';
  END IF;

  FOR v_row IN
    SELECT
      super_row.id_super,
      COALESCE(
        least(
          100,
          pg_catalog.ceil(
            pg_catalog.count(DISTINCT presence.id_usuario)::numeric * 100
            / nullif(tipo_row.cant, 0)
          )::integer
        ),
        0
      ) AS percentage
    FROM public.super AS super_row
    LEFT JOIN public.tipo_super AS tipo_row
      ON tipo_row.id_tipo = super_row.id_tipo
    LEFT JOIN public.super_usuario_presencia AS presence
      ON presence.id_super = super_row.id_super
      AND presence.actualizado_en > pg_catalog.now() - interval '5 minutes'
    WHERE super_row.id_super = ANY(p_ids_super)
    GROUP BY super_row.id_super, tipo_row.cant
  LOOP
    v_percentage := v_row.percentage;
    v_state_id := CASE
      WHEN v_percentage <= 20 THEN v_verde
      WHEN v_percentage <= 40 THEN v_amarillo
      WHEN v_percentage <= 60 THEN v_naranjo
      WHEN v_percentage <= 80 THEN v_rojo
      ELSE v_negro
    END;

    UPDATE public.super
    SET id_estado = v_state_id
    WHERE public.super.id_super = v_row.id_super
      AND public.super.id_estado IS DISTINCT FROM v_state_id;

    id_super := v_row.id_super;
    cantidad := v_percentage;
    RETURN NEXT;
  END LOOP;
END;
$$;


--
-- Name: obtener_catalogo_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_catalogo_admin() RETURNS TABLE(id_super uuid, nombre text, cadena text, region text, comuna text, calle text, osm_ref text, activo boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: obtener_estado_acceso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_estado_acceso() RETURNS TABLE(es_admin boolean, cuenta_baneada boolean, chat_baneado boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: obtener_mensajes_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_mensajes_admin() RETURNS TABLE(id_mensaje bigint, id_super uuid, nombre_supermercado text, nombre_usuario text, mensaje text, creado_en timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para moderar el chat.';
  END IF;

  RETURN QUERY
  SELECT
    chat_row.id_mensaje,
    chat_row.id_super,
    super_row.nombre::text,
    usuario_row.nombre::text,
    chat_row.mensaje,
    chat_row.creado_en
  FROM public.chat_mensaje_supermercado AS chat_row
  JOIN public.super AS super_row
    ON super_row.id_super = chat_row.id_super
  JOIN public.usuario AS usuario_row
    ON usuario_row.id_usuario = chat_row.id_usuario
  ORDER BY chat_row.id_mensaje DESC
  LIMIT 50;
END;
$$;


--
-- Name: obtener_mensajes_reportado_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_mensajes_reportado_admin(p_id_usuario uuid) RETURNS TABLE(id_mensaje bigint, nombre_supermercado text, mensaje text, creado_en timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para revisar mensajes del usuario.';
  END IF;
  IF p_id_usuario IS NULL THEN
    RAISE EXCEPTION 'El usuario seleccionado no es válido.';
  END IF;

  RETURN QUERY
  SELECT
    chat_row.id_mensaje,
    super_row.nombre::text,
    chat_row.mensaje,
    chat_row.creado_en
  FROM public.chat_mensaje_supermercado AS chat_row
  JOIN public.super AS super_row
    ON super_row.id_super = chat_row.id_super
  WHERE chat_row.id_usuario = p_id_usuario
  ORDER BY chat_row.id_mensaje DESC
  LIMIT 200;
END;
$$;


--
-- Name: obtener_mensajes_supermercado(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_mensajes_supermercado(p_id_super uuid, p_ultimo_id bigint DEFAULT 0) RETURNS TABLE(id_mensaje bigint, mensaje text, creado_en timestamp with time zone, nombre_usuario text, es_mio boolean, es_reportable boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para entrar al chat.';
  END IF;
  IF p_id_super IS NULL OR p_ultimo_id < 0 THEN
    RAISE EXCEPTION 'El supermercado o el cursor del chat no son válidos.';
  END IF;

  SELECT usuario_row.id_usuario
  INTO v_usuario_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid()
    AND NOT usuario_row.cuenta_baneada;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta no tiene permiso para entrar al chat.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.super AS super_row
    WHERE super_row.id_super = p_id_super
      AND super_row.catalogo_activo
  ) THEN
    RAISE EXCEPTION 'No se encontró un supermercado activo para el chat.';
  END IF;

  RETURN QUERY
  SELECT
    recent.id_mensaje,
    recent.mensaje,
    recent.creado_en,
    recent.nombre_usuario,
    recent.id_usuario = v_usuario_id,
    recent.rol_usuario <> 'admin'
  FROM (
    SELECT
      chat_row.id_mensaje,
      chat_row.id_usuario,
      chat_row.mensaje,
      chat_row.creado_en,
      usuario_row.nombre::text AS nombre_usuario,
      usuario_row.rol::text AS rol_usuario
    FROM public.chat_mensaje_supermercado AS chat_row
    JOIN public.usuario AS usuario_row
      ON usuario_row.id_usuario = chat_row.id_usuario
    WHERE chat_row.id_super = p_id_super
      AND (p_ultimo_id = 0 OR chat_row.id_mensaje > p_ultimo_id)
    ORDER BY chat_row.id_mensaje DESC
    LIMIT CASE WHEN p_ultimo_id = 0 THEN 100 ELSE 500 END
  ) AS recent
  ORDER BY recent.id_mensaje;
END;
$$;


--
-- Name: obtener_perfil_cuenta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_perfil_cuenta() RETURNS TABLE(nombre text, correo text, telefono text, region text, comuna text, calle text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para consultar tu perfil.';
  END IF;

  RETURN QUERY
  SELECT
    usuario_row.nombre::text,
    usuario_row.correo::text,
    usuario_row.telefono::text,
    direccion_row.region::text,
    direccion_row.comuna::text,
    direccion_row.calle::text
  FROM public.usuario AS usuario_row
  JOIN public.direccion_usuario AS direccion_row
    ON direccion_row.id_direccion = usuario_row.id_direccion
  WHERE usuario_row.auth_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró un perfil asociado a tu cuenta.';
  END IF;
END;
$$;


--
-- Name: obtener_reportes_chat_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_reportes_chat_admin() RETURNS TABLE(id_reportado uuid, nombre_reportado text, correo_reportado text, cantidad_reportantes bigint, id_reporte bigint, nombre_reportante text, nombre_supermercado text, mensaje_reportado text, reportado_en timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.es_superusuario() THEN
    RAISE EXCEPTION 'No tienes permiso para revisar reportes del chat.';
  END IF;

  RETURN QUERY
  WITH reportable_users AS (
    SELECT
      report_row.id_reportado,
      pg_catalog.count(DISTINCT report_row.id_reportante) AS report_count
    FROM public.chat_reporte_usuario AS report_row
    WHERE report_row.resuelto_en IS NULL
    GROUP BY report_row.id_reportado
    HAVING pg_catalog.count(DISTINCT report_row.id_reportante) >= 5
  )
  SELECT
    report_row.id_reportado,
    reported_user.nombre::text,
    auth_user.email::text,
    reportable_users.report_count,
    report_row.id_reporte,
    reporter_user.nombre::text,
    report_row.nombre_supermercado,
    report_row.mensaje_reportado,
    report_row.creado_en
  FROM reportable_users
  JOIN public.chat_reporte_usuario AS report_row
    ON report_row.id_reportado = reportable_users.id_reportado
    AND report_row.resuelto_en IS NULL
  JOIN public.usuario AS reported_user
    ON reported_user.id_usuario = report_row.id_reportado
  JOIN auth.users AS auth_user
    ON auth_user.id = reported_user.auth_id
  JOIN public.usuario AS reporter_user
    ON reporter_user.id_usuario = report_row.id_reportante
  ORDER BY report_row.id_reportado, report_row.creado_en DESC
  LIMIT 500;
END;
$$;


--
-- Name: obtener_resumen_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_resumen_admin() RETURNS TABLE(total_usuarios bigint, total_supermercados bigint, mensajes_chat bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: obtener_supermercados_en_zona(numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_supermercados_en_zona(p_south numeric, p_west numeric, p_north numeric, p_east numeric) RETURNS TABLE(id_super uuid, osm_ref text, nombre text, cadena text, region text, comuna text, calle text, latitud numeric, longitud numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para buscar supermercados.';
  END IF;

  IF p_south IS NULL
    OR p_west IS NULL
    OR p_north IS NULL
    OR p_east IS NULL
    OR p_south < -90
    OR p_north > 90
    OR p_west < -180
    OR p_east > 180
    OR p_south > p_north
    OR p_west > p_east
  THEN
    RAISE EXCEPTION 'Los límites de búsqueda no son válidos.';
  END IF;

  RETURN QUERY
  SELECT
    super_row.id_super,
    super_row.osm_ref,
    super_row.nombre::text,
    super_row.tipo::text,
    address_row.region::text,
    address_row.comuna::text,
    address_row.calle::text,
    address_row.latitu,
    address_row.longitu
  FROM public.super AS super_row
  JOIN public.direccion_super AS address_row
    ON address_row.id_direccion_s = super_row.id_direccion_s
  WHERE super_row.catalogo_activo
    AND super_row.osm_ref IS NOT NULL
    AND address_row.latitu BETWEEN p_south AND p_north
    AND address_row.longitu BETWEEN p_west AND p_east;
END;
$$;


--
-- Name: obtener_usuarios_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_usuarios_admin() RETURNS TABLE(id_usuario uuid, nombre text, correo text, telefono text, rol text, cuenta_baneada boolean, chat_baneado boolean, baneo_hasta timestamp with time zone, mensaje_reportado text, id_super_reporte uuid, nombre_super_reporte text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: obtener_votos_supermercado(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.obtener_votos_supermercado(p_id_super uuid) RETURNS TABLE(id_filtro uuid, tipo text, votos_positivos bigint, votos_negativos bigint, mi_voto smallint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    filtro_link.id_filtro,
    filtro_row.tipo,
    COUNT(DISTINCT voto.id_usuario) FILTER (WHERE voto.valor_voto > 0),
    COUNT(DISTINCT voto.id_usuario) FILTER (WHERE voto.valor_voto < 0),
    (MAX(voto.valor_voto) FILTER (WHERE voto.id_usuario = usuario_row.id_usuario))::smallint
  FROM public.filtro_super AS filtro_link
  JOIN public.filtro AS filtro_row
    ON filtro_row.id_filtro = filtro_link.id_filtro
  JOIN public.super AS super_row
    ON super_row.id_super = filtro_link.id_super
    AND super_row.catalogo_activo
  LEFT JOIN public.voto_filtro AS voto
    ON voto.id_super = filtro_link.id_super
    AND voto.id_filtro = filtro_link.id_filtro
    AND CASE
      WHEN pg_catalog.translate(
        pg_catalog.lower(filtro_row.tipo),
        'áéíóúüñ',
        'aeiouun'
      ) LIKE '%carro%'
        OR pg_catalog.translate(
          pg_catalog.lower(filtro_row.tipo),
          'áéíóúüñ',
          'aeiouun'
        ) LIKE '%carrit%'
        OR pg_catalog.translate(
          pg_catalog.lower(filtro_row.tipo),
          'áéíóúüñ',
          'aeiouun'
        ) LIKE '%estacionamiento%'
      THEN voto.fecha_hora >= pg_catalog.now() - interval '1 hour'
      WHEN pg_catalog.translate(
        pg_catalog.lower(filtro_row.tipo),
        'áéíóúüñ',
        'aeiouun'
      ) LIKE '%oferta%'
      THEN voto.fecha_hora >= pg_catalog.now() - interval '7 days'
      ELSE true
    END
  LEFT JOIN public.usuario AS usuario_row
    ON usuario_row.auth_id = auth.uid()
  WHERE filtro_link.id_super = p_id_super
    AND super_row.catalogo_activo
  GROUP BY filtro_link.id_filtro, filtro_row.tipo, usuario_row.id_usuario
  ORDER BY filtro_row.tipo;
$$;


--
-- Name: registrar_voto_supermercado(uuid, uuid, smallint, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_voto_supermercado(p_id_super uuid, p_id_filtro uuid, p_voto smallint, p_latitud numeric, p_longitud numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: reportar_mensaje_chat(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reportar_mensaje_chat(p_id_mensaje bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_reportante_id uuid;
  v_reportado_id uuid;
  v_nombre_supermercado text;
  v_mensaje text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para reportar un mensaje.';
  END IF;
  IF p_id_mensaje IS NULL OR p_id_mensaje <= 0 THEN
    RAISE EXCEPTION 'El mensaje seleccionado no es válido.';
  END IF;

  SELECT usuario_row.id_usuario
  INTO v_reportante_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid()
    AND NOT usuario_row.cuenta_baneada;

  IF v_reportante_id IS NULL THEN
    RAISE EXCEPTION 'La cuenta no tiene permiso para reportar mensajes.';
  END IF;

  SELECT chat_row.id_usuario, super_row.nombre::text, chat_row.mensaje
  INTO v_reportado_id, v_nombre_supermercado, v_mensaje
  FROM public.chat_mensaje_supermercado AS chat_row
  JOIN public.super AS super_row
    ON super_row.id_super = chat_row.id_super
  WHERE chat_row.id_mensaje = p_id_mensaje
    AND super_row.catalogo_activo;

  IF v_reportado_id IS NULL THEN
    RAISE EXCEPTION 'El mensaje ya no está disponible para reportarlo.';
  END IF;
  IF v_reportante_id = v_reportado_id THEN
    RAISE EXCEPTION 'No puedes reportar tus propios mensajes.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.usuario AS reported_user
    WHERE reported_user.id_usuario = v_reportado_id
      AND reported_user.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'No se pueden reportar mensajes del administrador desde el chat.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.chat_reporte_usuario AS report_row
    WHERE report_row.id_reportante = v_reportante_id
      AND report_row.id_mensaje = p_id_mensaje
  ) THEN
    RAISE EXCEPTION 'Ya reportaste este mensaje.';
  END IF;

  INSERT INTO public.chat_reporte_usuario (
    id_reportante,
    id_reportado,
    id_mensaje,
    nombre_supermercado,
    mensaje_reportado
  )
  VALUES (
    v_reportante_id,
    v_reportado_id,
    p_id_mensaje,
    v_nombre_supermercado,
    v_mensaje
  );
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: sincronizar_supermercado_osm(text, text, text, text, text, text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_supermercado_osm(p_osm_ref text, p_nombre text, p_cadena text, p_region text, p_comuna text, p_calle text, p_latitud numeric, p_longitud numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_super_id uuid;
  v_estado_id uuid;
  v_tipo_id uuid;
  v_direccion_id uuid;
  v_tipo_nombre text;
  v_capacidad integer;
  v_nombre_normalizado text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para sincronizar supermercados.';
  END IF;

  IF NULLIF(BTRIM(p_osm_ref), '') IS NULL
    OR NULLIF(BTRIM(p_nombre), '') IS NULL
    OR p_latitud IS NULL
    OR p_latitud < -90
    OR p_latitud > 90
    OR p_longitud IS NULL
    OR p_longitud < -180
    OR p_longitud > 180
  THEN
    RAISE EXCEPTION 'Los datos recibidos desde OpenStreetMap no son válidos.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('osm-super:' || p_osm_ref, 0)
  );

  v_nombre_normalizado := pg_catalog.lower(
    COALESCE(p_nombre, '') || ' ' || COALESCE(p_cadena, '')
  );

  IF v_nombre_normalizado LIKE '%expres%' THEN
    v_tipo_nombre := 'Express';
    v_capacidad := 70;
  ELSIF v_nombre_normalizado LIKE '%hiper%'
    OR v_nombre_normalizado LIKE '%hyper%'
  THEN
    v_tipo_nombre := 'Hiper';
    v_capacidad := 200;
  ELSE
    v_tipo_nombre := 'Normal';
    v_capacidad := 120;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tipo-super:' || pg_catalog.lower(v_tipo_nombre), 0)
  );

  SELECT tipo_row.id_tipo
  INTO v_tipo_id
  FROM public.tipo_super AS tipo_row
  WHERE CASE
    WHEN v_tipo_nombre = 'Hiper' THEN pg_catalog.lower(pg_catalog.btrim(tipo_row.tipo)) LIKE 'hiper%'
    WHEN v_tipo_nombre = 'Express' THEN pg_catalog.lower(pg_catalog.btrim(tipo_row.tipo)) LIKE 'expres%'
    ELSE pg_catalog.lower(pg_catalog.btrim(tipo_row.tipo)) = 'normal'
  END
  ORDER BY tipo_row.id_tipo
  LIMIT 1;

  IF v_tipo_id IS NULL THEN
    INSERT INTO public.tipo_super (tipo, cant)
    VALUES (v_tipo_nombre, v_capacidad)
    RETURNING id_tipo INTO v_tipo_id;
  ELSE
    UPDATE public.tipo_super
    SET cant = v_capacidad
    WHERE id_tipo = v_tipo_id;
  END IF;

  SELECT super_row.id_super, super_row.id_direccion_s
  INTO v_super_id, v_direccion_id
  FROM public.super AS super_row
  WHERE super_row.osm_ref = p_osm_ref
  LIMIT 1;

  IF v_super_id IS NULL THEN
    SELECT estado_row.id_estado
    INTO v_estado_id
    FROM public.estado AS estado_row
    WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = 'verde'
    ORDER BY estado_row.cantidad DESC, estado_row.id_estado
    LIMIT 1;

    IF v_estado_id IS NULL THEN
      RAISE EXCEPTION 'No existe la categoría compartida Verde en la tabla estado.';
    END IF;

    INSERT INTO public.direccion_super (
      region,
      comuna,
      calle,
      latitu,
      longitu
    )
    VALUES (
      COALESCE(NULLIF(BTRIM(p_region), ''), 'No disponible'),
      COALESCE(NULLIF(BTRIM(p_comuna), ''), 'No disponible'),
      COALESCE(NULLIF(BTRIM(p_calle), ''), 'No disponible'),
      p_latitud,
      p_longitud
    )
    RETURNING id_direccion_s INTO v_direccion_id;

    INSERT INTO public.super (
      nombre,
      id_estado,
      id_tipo,
      id_direccion_s,
      tipo,
      osm_ref
    )
    VALUES (
      BTRIM(p_nombre),
      v_estado_id,
      v_tipo_id,
      v_direccion_id,
      COALESCE(NULLIF(BTRIM(p_cadena), ''), 'Supermercado'),
      p_osm_ref
    )
    RETURNING id_super INTO v_super_id;
  ELSE
    UPDATE public.direccion_super
    SET
      region = CASE
        WHEN NULLIF(BTRIM(p_region), '') IS NOT NULL THEN BTRIM(p_region)
        ELSE region
      END,
      comuna = CASE
        WHEN NULLIF(BTRIM(p_comuna), '') IS NOT NULL THEN BTRIM(p_comuna)
        ELSE comuna
      END,
      calle = CASE
        WHEN NULLIF(BTRIM(p_calle), '') IS NOT NULL THEN BTRIM(p_calle)
        ELSE calle
      END,
      latitu = p_latitud,
      longitu = p_longitud
    WHERE id_direccion_s = v_direccion_id;

    UPDATE public.super
    SET
      nombre = BTRIM(p_nombre),
      id_tipo = v_tipo_id,
      tipo = COALESCE(NULLIF(BTRIM(p_cadena), ''), tipo)
    WHERE id_super = v_super_id;
  END IF;

  INSERT INTO public.filtro_super (id_filtro, id_super, valor)
  SELECT filtro_row.id_filtro, v_super_id, 0
  FROM public.filtro AS filtro_row
  ON CONFLICT (id_filtro, id_super) DO NOTHING;

  RETURN v_super_id;
END;
$$;


--
-- Name: sincronizar_supermercados_osm(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_supermercados_osm(p_supermercados jsonb) RETURNS TABLE(osm_ref text, id_super uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
    IF EXISTS (
      SELECT 1
      FROM public.supermercado_catalogo_excluido AS excluded_store
      WHERE excluded_store.osm_ref = v_osm_ref
    ) THEN
      CONTINUE;
    END IF;

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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_mensaje_supermercado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_mensaje_supermercado (
    id_mensaje bigint NOT NULL,
    id_super uuid NOT NULL,
    id_usuario uuid NOT NULL,
    mensaje text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_mensaje_supermercado_mensaje_length CHECK (((char_length(btrim(mensaje)) >= 1) AND (char_length(btrim(mensaje)) <= 500)))
);


--
-- Name: chat_mensaje_supermercado_id_mensaje_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chat_mensaje_supermercado ALTER COLUMN id_mensaje ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.chat_mensaje_supermercado_id_mensaje_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_reporte_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_reporte_usuario (
    id_reporte bigint NOT NULL,
    id_reportante uuid NOT NULL,
    id_reportado uuid NOT NULL,
    id_mensaje bigint NOT NULL,
    nombre_supermercado text NOT NULL,
    mensaje_reportado text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    resuelto_en timestamp with time zone,
    resuelto_por uuid,
    CONSTRAINT chat_reporte_usuario_no_self CHECK ((id_reportante <> id_reportado)),
    CONSTRAINT chat_reporte_usuario_snapshot_length CHECK (((char_length(btrim(mensaje_reportado)) >= 1) AND (char_length(btrim(mensaje_reportado)) <= 500)))
);


--
-- Name: chat_reporte_usuario_id_reporte_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chat_reporte_usuario ALTER COLUMN id_reporte ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.chat_reporte_usuario_id_reporte_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_super; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_super (
    id_chat uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuario uuid,
    id_super uuid,
    comentario text NOT NULL,
    fecha_hora timestamp without time zone NOT NULL
);


--
-- Name: direccion_super; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direccion_super (
    id_direccion_s uuid DEFAULT gen_random_uuid() NOT NULL,
    region text NOT NULL,
    comuna text NOT NULL,
    calle text NOT NULL,
    latitu numeric(9,6) NOT NULL,
    longitu numeric(9,6) NOT NULL
);


--
-- Name: direccion_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direccion_usuario (
    id_direccion uuid DEFAULT gen_random_uuid() NOT NULL,
    region text NOT NULL,
    comuna text NOT NULL,
    calle text NOT NULL
);


--
-- Name: estado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estado (
    id_estado uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria text NOT NULL,
    cantidad integer NOT NULL
);


--
-- Name: filtro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filtro (
    id_filtro uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL
);


--
-- Name: filtro_super; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filtro_super (
    id_filtro uuid NOT NULL,
    id_super uuid NOT NULL,
    valor integer NOT NULL
);


--
-- Name: rango; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rango (
    id_rango uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    puntaje_req integer NOT NULL
);


--
-- Name: super; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.super (
    id_super uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    id_estado uuid NOT NULL,
    id_tipo uuid NOT NULL,
    id_direccion_s uuid NOT NULL,
    tipo text NOT NULL,
    osm_ref text,
    catalogo_activo boolean DEFAULT true NOT NULL
);


--
-- Name: super_usuario_presencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.super_usuario_presencia (
    id_usuario uuid NOT NULL,
    id_super uuid NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supermercado_catalogo_excluido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supermercado_catalogo_excluido (
    osm_ref text NOT NULL,
    eliminado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tipo_super; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipo_super (
    id_tipo uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    cant integer NOT NULL
);


--
-- Name: ubi_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ubi_usuario (
    id_ubi uuid DEFAULT gen_random_uuid() NOT NULL,
    latitu numeric(9,6) NOT NULL,
    longitu numeric(9,6) NOT NULL,
    tiempo timestamp without time zone NOT NULL
);


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    id_usuario uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    nombre text NOT NULL,
    correo text NOT NULL,
    contrase text,
    id_rango uuid NOT NULL,
    id_direccion uuid NOT NULL,
    id_ubi uuid NOT NULL,
    creado_en timestamp without time zone DEFAULT now(),
    telefono text,
    rol text DEFAULT 'usuario'::text NOT NULL,
    cuenta_baneada boolean DEFAULT false NOT NULL,
    chat_baneado boolean DEFAULT false NOT NULL,
    baneo_hasta timestamp with time zone,
    CONSTRAINT usuario_rol_valid CHECK ((rol = ANY (ARRAY['usuario'::text, 'admin'::text])))
);


--
-- Name: voto_filtro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voto_filtro (
    id_voto uuid DEFAULT gen_random_uuid() NOT NULL,
    id_usuario uuid,
    id_super uuid,
    id_filtro uuid,
    valor_voto integer NOT NULL,
    fecha_hora timestamp without time zone NOT NULL
);


--
-- Name: chat_mensaje_supermercado chat_mensaje_supermercado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensaje_supermercado
    ADD CONSTRAINT chat_mensaje_supermercado_pkey PRIMARY KEY (id_mensaje);


--
-- Name: chat_reporte_usuario chat_reporte_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reporte_usuario
    ADD CONSTRAINT chat_reporte_usuario_pkey PRIMARY KEY (id_reporte);


--
-- Name: chat_super chat_super_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_super
    ADD CONSTRAINT chat_super_pkey PRIMARY KEY (id_chat);


--
-- Name: direccion_super direccion_super_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direccion_super
    ADD CONSTRAINT direccion_super_pkey PRIMARY KEY (id_direccion_s);


--
-- Name: direccion_usuario direccion_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direccion_usuario
    ADD CONSTRAINT direccion_usuario_pkey PRIMARY KEY (id_direccion);


--
-- Name: estado estado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estado
    ADD CONSTRAINT estado_pkey PRIMARY KEY (id_estado);


--
-- Name: filtro filtro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtro
    ADD CONSTRAINT filtro_pkey PRIMARY KEY (id_filtro);


--
-- Name: filtro_super filtro_super_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtro_super
    ADD CONSTRAINT filtro_super_pkey PRIMARY KEY (id_filtro, id_super);


--
-- Name: rango rango_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rango
    ADD CONSTRAINT rango_pkey PRIMARY KEY (id_rango);


--
-- Name: super super_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super
    ADD CONSTRAINT super_pkey PRIMARY KEY (id_super);


--
-- Name: super_usuario_presencia super_usuario_presencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_usuario_presencia
    ADD CONSTRAINT super_usuario_presencia_pkey PRIMARY KEY (id_usuario, id_super);


--
-- Name: supermercado_catalogo_excluido supermercado_catalogo_excluido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supermercado_catalogo_excluido
    ADD CONSTRAINT supermercado_catalogo_excluido_pkey PRIMARY KEY (osm_ref);


--
-- Name: tipo_super tipo_super_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipo_super
    ADD CONSTRAINT tipo_super_pkey PRIMARY KEY (id_tipo);


--
-- Name: ubi_usuario ubi_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubi_usuario
    ADD CONSTRAINT ubi_usuario_pkey PRIMARY KEY (id_ubi);


--
-- Name: usuario usuario_correo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_correo_key UNIQUE (correo);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id_usuario);


--
-- Name: voto_filtro voto_filtro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voto_filtro
    ADD CONSTRAINT voto_filtro_pkey PRIMARY KEY (id_voto);


--
-- Name: chat_mensaje_supermercado_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_mensaje_supermercado_recent_idx ON public.chat_mensaje_supermercado USING btree (id_super, id_mensaje DESC);


--
-- Name: chat_reporte_usuario_pending_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_reporte_usuario_pending_target_idx ON public.chat_reporte_usuario USING btree (id_reportado, creado_en DESC) WHERE (resuelto_en IS NULL);


--
-- Name: chat_reporte_usuario_reporter_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chat_reporte_usuario_reporter_message_unique ON public.chat_reporte_usuario USING btree (id_reportante, id_mensaje);


--
-- Name: direccion_super_map_bounds_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX direccion_super_map_bounds_idx ON public.direccion_super USING btree (latitu, longitu) WHERE ((latitu IS NOT NULL) AND (longitu IS NOT NULL));


--
-- Name: estado_categoria_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estado_categoria_unique ON public.estado USING btree (lower(btrim(categoria)));


--
-- Name: super_osm_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX super_osm_ref_unique ON public.super USING btree (osm_ref) WHERE (osm_ref IS NOT NULL);


--
-- Name: super_usuario_presencia_super_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX super_usuario_presencia_super_recent_idx ON public.super_usuario_presencia USING btree (id_super, actualizado_en);


--
-- Name: super_usuario_presencia_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX super_usuario_presencia_updated_idx ON public.super_usuario_presencia USING btree (actualizado_en);


--
-- Name: usuario_auth_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuario_auth_id_unique ON public.usuario USING btree (auth_id);


--
-- Name: chat_mensaje_supermercado chat_mensaje_supermercado_id_super_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensaje_supermercado
    ADD CONSTRAINT chat_mensaje_supermercado_id_super_fkey FOREIGN KEY (id_super) REFERENCES public.super(id_super) ON DELETE CASCADE;


--
-- Name: chat_mensaje_supermercado chat_mensaje_supermercado_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_mensaje_supermercado
    ADD CONSTRAINT chat_mensaje_supermercado_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario) ON DELETE CASCADE;


--
-- Name: chat_reporte_usuario chat_reporte_usuario_id_reportado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reporte_usuario
    ADD CONSTRAINT chat_reporte_usuario_id_reportado_fkey FOREIGN KEY (id_reportado) REFERENCES public.usuario(id_usuario) ON DELETE CASCADE;


--
-- Name: chat_reporte_usuario chat_reporte_usuario_id_reportante_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reporte_usuario
    ADD CONSTRAINT chat_reporte_usuario_id_reportante_fkey FOREIGN KEY (id_reportante) REFERENCES public.usuario(id_usuario) ON DELETE CASCADE;


--
-- Name: chat_reporte_usuario chat_reporte_usuario_resuelto_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reporte_usuario
    ADD CONSTRAINT chat_reporte_usuario_resuelto_por_fkey FOREIGN KEY (resuelto_por) REFERENCES public.usuario(id_usuario) ON DELETE SET NULL;


--
-- Name: chat_super chat_super_id_super_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_super
    ADD CONSTRAINT chat_super_id_super_fkey FOREIGN KEY (id_super) REFERENCES public.super(id_super) ON DELETE CASCADE;


--
-- Name: chat_super chat_super_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_super
    ADD CONSTRAINT chat_super_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario) ON DELETE CASCADE;


--
-- Name: filtro_super filtro_super_id_filtro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtro_super
    ADD CONSTRAINT filtro_super_id_filtro_fkey FOREIGN KEY (id_filtro) REFERENCES public.filtro(id_filtro) ON DELETE CASCADE;


--
-- Name: filtro_super filtro_super_id_super_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filtro_super
    ADD CONSTRAINT filtro_super_id_super_fkey FOREIGN KEY (id_super) REFERENCES public.super(id_super) ON DELETE CASCADE;


--
-- Name: super super_id_direccion_s_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super
    ADD CONSTRAINT super_id_direccion_s_fkey FOREIGN KEY (id_direccion_s) REFERENCES public.direccion_super(id_direccion_s) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: super super_id_estado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super
    ADD CONSTRAINT super_id_estado_fkey FOREIGN KEY (id_estado) REFERENCES public.estado(id_estado) ON UPDATE CASCADE ON DELETE SET DEFAULT;


--
-- Name: super super_id_tipo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super
    ADD CONSTRAINT super_id_tipo_fkey FOREIGN KEY (id_tipo) REFERENCES public.tipo_super(id_tipo) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: super_usuario_presencia super_usuario_presencia_id_super_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_usuario_presencia
    ADD CONSTRAINT super_usuario_presencia_id_super_fkey FOREIGN KEY (id_super) REFERENCES public.super(id_super) ON DELETE CASCADE;


--
-- Name: super_usuario_presencia super_usuario_presencia_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_usuario_presencia
    ADD CONSTRAINT super_usuario_presencia_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario) ON DELETE CASCADE;


--
-- Name: usuario usuario_auth_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: usuario usuario_id_direccion_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_id_direccion_fkey1 FOREIGN KEY (id_direccion) REFERENCES public.direccion_usuario(id_direccion) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: usuario usuario_id_rango_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_id_rango_fkey FOREIGN KEY (id_rango) REFERENCES public.rango(id_rango) ON UPDATE CASCADE ON DELETE SET DEFAULT;


--
-- Name: usuario usuario_id_ubi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_id_ubi_fkey FOREIGN KEY (id_ubi) REFERENCES public.ubi_usuario(id_ubi) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: voto_filtro voto_filtro_id_filtro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voto_filtro
    ADD CONSTRAINT voto_filtro_id_filtro_fkey FOREIGN KEY (id_filtro) REFERENCES public.filtro(id_filtro) ON DELETE CASCADE;


--
-- Name: voto_filtro voto_filtro_id_super_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voto_filtro
    ADD CONSTRAINT voto_filtro_id_super_fkey FOREIGN KEY (id_super) REFERENCES public.super(id_super) ON DELETE CASCADE;


--
-- Name: voto_filtro voto_filtro_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voto_filtro
    ADD CONSTRAINT voto_filtro_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario) ON DELETE CASCADE;


--
-- Name: filtro_super Filtros visibles a todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Filtros visibles a todos" ON public.filtro_super FOR SELECT USING (true);


--
-- Name: super Solo admin modifica supermercados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Solo admin modifica supermercados" ON public.super USING ((auth.role() = 'admin'::text));


--
-- Name: super Supermercados visibles a todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Supermercados visibles a todos" ON public.super FOR SELECT USING (true);


--
-- Name: usuario Usuarios actualizan sus datos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios actualizan sus datos" ON public.usuario FOR UPDATE USING ((auth_id = auth.uid()));


--
-- Name: usuario Usuarios borran sus datos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios borran sus datos" ON public.usuario FOR DELETE USING ((auth_id = auth.uid()));


--
-- Name: chat_super Usuarios crean chats propios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios crean chats propios" ON public.chat_super FOR INSERT WITH CHECK ((id_usuario IN ( SELECT usuario.id_usuario
   FROM public.usuario
  WHERE (usuario.auth_id = auth.uid()))));


--
-- Name: voto_filtro Usuarios emiten votos propios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios emiten votos propios" ON public.voto_filtro FOR INSERT WITH CHECK ((id_usuario IN ( SELECT usuario.id_usuario
   FROM public.usuario
  WHERE (usuario.auth_id = auth.uid()))));


--
-- Name: usuario Usuarios solo ven sus datos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios solo ven sus datos" ON public.usuario FOR SELECT USING ((auth_id = auth.uid()));


--
-- Name: direccion_usuario Usuarios ven su direccion; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios ven su direccion" ON public.direccion_usuario FOR SELECT USING ((id_direccion IN ( SELECT usuario.id_direccion
   FROM public.usuario
  WHERE (usuario.auth_id = auth.uid()))));


--
-- Name: ubi_usuario Usuarios ven su ubicación; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios ven su ubicación" ON public.ubi_usuario FOR SELECT USING ((id_ubi IN ( SELECT usuario.id_ubi
   FROM public.usuario
  WHERE (usuario.auth_id = auth.uid()))));


--
-- Name: chat_super Usuarios ven sus chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios ven sus chats" ON public.chat_super FOR SELECT USING ((id_usuario IN ( SELECT usuario.id_usuario
   FROM public.usuario
  WHERE (usuario.auth_id = auth.uid()))));


--
-- Name: voto_filtro Usuarios ven sus votos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios ven sus votos" ON public.voto_filtro FOR SELECT USING ((id_usuario IN ( SELECT usuario.id_usuario
   FROM public.usuario
  WHERE (usuario.auth_id = auth.uid()))));


--
-- Name: chat_mensaje_supermercado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_mensaje_supermercado ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_reporte_usuario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_reporte_usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_super; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_super ENABLE ROW LEVEL SECURITY;

--
-- Name: direccion_super; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direccion_super ENABLE ROW LEVEL SECURITY;

--
-- Name: direccion_usuario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direccion_usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: estado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estado ENABLE ROW LEVEL SECURITY;

--
-- Name: filtro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.filtro ENABLE ROW LEVEL SECURITY;

--
-- Name: filtro_super; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.filtro_super ENABLE ROW LEVEL SECURITY;

--
-- Name: rango; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rango ENABLE ROW LEVEL SECURITY;

--
-- Name: super; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.super ENABLE ROW LEVEL SECURITY;

--
-- Name: super_usuario_presencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.super_usuario_presencia ENABLE ROW LEVEL SECURITY;

--
-- Name: supermercado_catalogo_excluido; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supermercado_catalogo_excluido ENABLE ROW LEVEL SECURITY;

--
-- Name: tipo_super; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipo_super ENABLE ROW LEVEL SECURITY;

--
-- Name: ubi_usuario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ubi_usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: usuario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: voto_filtro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voto_filtro ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict yIznI7n8n8Npxat9tv1D5RZdKOs6iU2sdn12BWU6BZ2EwSdWPOSDzeXx0doWepf

