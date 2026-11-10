BEGIN;

LOCK TABLE public.estado, public.super IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMPORARY TABLE canonical_occupancy_states (
  categoria text NOT NULL,
  cantidad integer NOT NULL,
  id_estado uuid NOT NULL,
  aliases text[] NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_category record;
  v_state_id uuid;
BEGIN
  FOR v_category IN
    SELECT *
    FROM (
      VALUES
        ('Verde', 20, ARRAY['verde']::text[]),
        ('Amarillo', 40, ARRAY['amarillo']::text[]),
        ('Naranjo', 60, ARRAY['naranjo', 'naranja']::text[]),
        ('Rojo', 80, ARRAY['rojo']::text[]),
        ('Negro', 100, ARRAY['negro']::text[])
    ) AS categories(categoria, cantidad, aliases)
  LOOP
    SELECT estado_row.id_estado
    INTO v_state_id
    FROM public.estado AS estado_row
    WHERE pg_catalog.lower(pg_catalog.btrim(estado_row.categoria)) = ANY(v_category.aliases)
    ORDER BY
      CASE WHEN estado_row.cantidad = v_category.cantidad THEN 0 ELSE 1 END,
      estado_row.id_estado
    LIMIT 1;

    IF v_state_id IS NULL THEN
      INSERT INTO public.estado (categoria, cantidad)
      VALUES (v_category.categoria, v_category.cantidad)
      RETURNING id_estado INTO v_state_id;
    ELSE
      UPDATE public.estado
      SET
        categoria = v_category.categoria,
        cantidad = v_category.cantidad
      WHERE id_estado = v_state_id;
    END IF;

    INSERT INTO canonical_occupancy_states (categoria, cantidad, id_estado, aliases)
    VALUES (v_category.categoria, v_category.cantidad, v_state_id, v_category.aliases);
  END LOOP;
END;
$$;

UPDATE public.super AS super_row
SET id_estado = COALESCE(
  matched_category.id_estado,
  CASE
    WHEN state_row.cantidad <= 20 THEN (SELECT id_estado FROM canonical_occupancy_states WHERE categoria = 'Verde')
    WHEN state_row.cantidad <= 40 THEN (SELECT id_estado FROM canonical_occupancy_states WHERE categoria = 'Amarillo')
    WHEN state_row.cantidad <= 60 THEN (SELECT id_estado FROM canonical_occupancy_states WHERE categoria = 'Naranjo')
    WHEN state_row.cantidad <= 80 THEN (SELECT id_estado FROM canonical_occupancy_states WHERE categoria = 'Rojo')
    ELSE (SELECT id_estado FROM canonical_occupancy_states WHERE categoria = 'Negro')
  END
)
FROM public.estado AS state_row
LEFT JOIN canonical_occupancy_states AS matched_category
  ON pg_catalog.lower(pg_catalog.btrim(state_row.categoria)) = ANY(matched_category.aliases)
WHERE super_row.id_estado = state_row.id_estado;

DELETE FROM public.estado AS state_row
WHERE NOT EXISTS (
  SELECT 1
  FROM canonical_occupancy_states AS canonical
  WHERE canonical.id_estado = state_row.id_estado
);

CREATE UNIQUE INDEX IF NOT EXISTS estado_categoria_unique
  ON public.estado (pg_catalog.lower(pg_catalog.btrim(categoria)));

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

NOTIFY pgrst, 'reload schema';

COMMIT;
