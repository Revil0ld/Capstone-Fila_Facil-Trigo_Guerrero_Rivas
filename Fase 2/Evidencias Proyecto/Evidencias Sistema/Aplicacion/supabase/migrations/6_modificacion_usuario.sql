BEGIN;

CREATE OR REPLACE FUNCTION public.obtener_perfil_cuenta()
RETURNS TABLE (
  nombre text,
  correo text,
  telefono text,
  region text,
  comuna text,
  calle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.actualizar_perfil_cuenta(
  p_nombre text,
  p_telefono text,
  p_region text,
  p_comuna text,
  p_calle text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.obtener_perfil_cuenta()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_perfil_cuenta(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_perfil_cuenta()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_perfil_cuenta(text, text, text, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
