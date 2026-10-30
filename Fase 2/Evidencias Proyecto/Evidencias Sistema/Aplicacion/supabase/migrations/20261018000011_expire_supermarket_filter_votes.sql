BEGIN;

CREATE TABLE IF NOT EXISTS public.supermercado_catalogo_excluido (
  osm_ref text PRIMARY KEY,
  eliminado_en timestamptz NOT NULL DEFAULT pg_catalog.now()
);

REVOKE ALL ON TABLE public.supermercado_catalogo_excluido
  FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.eliminar_supermercado_admin(p_id_super uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.obtener_votos_supermercado(p_id_super uuid)
RETURNS TABLE (
  id_filtro uuid,
  tipo text,
  votos_positivos bigint,
  votos_negativos bigint,
  mi_voto smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.registrar_voto_supermercado(
  p_id_super uuid,
  p_id_filtro uuid,
  p_voto smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid;
  v_filter_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para votar.';
  END IF;

  IF p_id_super IS NULL OR p_id_filtro IS NULL OR p_voto IS NULL OR p_voto NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'El voto debe ser positivo o negativo.';
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

REVOKE ALL ON FUNCTION public.obtener_votos_supermercado(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_voto_supermercado(uuid, uuid, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_votos_supermercado(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_voto_supermercado(uuid, uuid, smallint)
  TO authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_supermercados_osm(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_supermercado_admin(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_supermercados_osm(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_supermercado_admin(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
