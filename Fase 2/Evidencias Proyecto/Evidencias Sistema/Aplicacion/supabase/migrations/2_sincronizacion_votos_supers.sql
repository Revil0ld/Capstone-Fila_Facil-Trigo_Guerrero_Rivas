ALTER TABLE public.super
  ADD COLUMN IF NOT EXISTS osm_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS super_osm_ref_unique
  ON public.super (osm_ref)
  WHERE osm_ref IS NOT NULL;

DROP FUNCTION IF EXISTS public.obtener_votos_supermercado(text);
DROP FUNCTION IF EXISTS public.registrar_voto_supermercado(text, uuid, smallint);

CREATE OR REPLACE FUNCTION public.sincronizar_supermercado_osm(
  p_osm_ref text,
  p_nombre text,
  p_cadena text,
  p_region text,
  p_comuna text,
  p_calle text,
  p_latitud numeric,
  p_longitud numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.sincronizar_supermercados_osm(p_supermercados jsonb)
RETURNS TABLE (osm_ref text, id_super uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store jsonb;
  v_osm_ref text;
  v_super_id uuid;
BEGIN
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

    osm_ref := v_osm_ref;
    id_super := v_super_id;
    RETURN NEXT;
  END LOOP;
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
  LEFT JOIN public.voto_filtro AS voto
    ON voto.id_super = filtro_link.id_super
    AND voto.id_filtro = filtro_link.id_filtro
  LEFT JOIN public.usuario AS usuario_row
    ON usuario_row.auth_id = auth.uid()
  WHERE filtro_link.id_super = p_id_super
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para votar.';
  END IF;

  IF p_voto NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'El voto debe ser positivo o negativo.';
  END IF;

  SELECT usuario_row.id_usuario
  INTO v_usuario_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid();

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu perfil de usuario para registrar el voto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.filtro_super AS filtro_link
    WHERE filtro_link.id_super = p_id_super
      AND filtro_link.id_filtro = p_id_filtro
  ) THEN
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

REVOKE ALL ON FUNCTION public.sincronizar_supermercado_osm(
  text, text, text, text, text, text, numeric, numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sincronizar_supermercados_osm(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_votos_supermercado(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_voto_supermercado(uuid, uuid, smallint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_supermercado_osm(
  text, text, text, text, text, text, numeric, numeric
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.sincronizar_supermercado_osm(
  text, text, text, text, text, text, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_supermercados_osm(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_votos_supermercado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_voto_supermercado(uuid, uuid, smallint)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
