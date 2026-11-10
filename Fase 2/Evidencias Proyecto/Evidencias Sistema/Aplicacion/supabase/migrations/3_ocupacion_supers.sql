CREATE OR REPLACE FUNCTION public.obtener_aforo_supermercados(p_ids_super uuid[])
RETURNS TABLE (id_super uuid, cantidad integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para consultar el aforo.';
  END IF;

  RETURN QUERY
  SELECT super_row.id_super, estado_row.cantidad
  FROM public.super AS super_row
  LEFT JOIN public.estado AS estado_row
    ON estado_row.id_estado = super_row.id_estado
  WHERE super_row.id_super = ANY(p_ids_super);
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_aforo_supermercados(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_aforo_supermercados(uuid[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
