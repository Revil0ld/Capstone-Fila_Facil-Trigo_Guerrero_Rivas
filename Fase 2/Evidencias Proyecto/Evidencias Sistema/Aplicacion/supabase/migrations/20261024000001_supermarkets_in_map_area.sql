BEGIN;

CREATE INDEX IF NOT EXISTS direccion_super_map_bounds_idx
  ON public.direccion_super (latitu, longitu)
  WHERE latitu IS NOT NULL AND longitu IS NOT NULL;

CREATE OR REPLACE FUNCTION public.obtener_supermercados_en_zona(
  p_south numeric,
  p_west numeric,
  p_north numeric,
  p_east numeric
)
RETURNS TABLE (
  id_super uuid,
  osm_ref text,
  nombre text,
  cadena text,
  region text,
  comuna text,
  calle text,
  latitud numeric,
  longitud numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.obtener_supermercados_en_zona(numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_supermercados_en_zona(numeric, numeric, numeric, numeric)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
