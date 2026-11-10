ALTER TABLE public.usuario
  ALTER COLUMN contrase DROP NOT NULL;

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS telefono text;

CREATE UNIQUE INDEX IF NOT EXISTS usuario_auth_id_unique
  ON public.usuario (auth_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_info
    WHERE constraint_info.conrelid = 'public.usuario'::regclass
      AND constraint_info.confrelid = 'auth.users'::regclass
      AND constraint_info.contype = 'f'
      AND constraint_info.conkey = ARRAY[
        (
          SELECT attribute_info.attnum
          FROM pg_attribute AS attribute_info
          WHERE attribute_info.attrelid = 'public.usuario'::regclass
            AND attribute_info.attname = 'auth_id'
            AND NOT attribute_info.attisdropped
        )
      ]::smallint[]
  ) THEN
    ALTER TABLE public.usuario
      ADD CONSTRAINT usuario_auth_id_fkey
      FOREIGN KEY (auth_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fila_facil_create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.fila_facil_create_user_profile()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fila_facil_after_auth_user_insert ON auth.users;

CREATE TRIGGER fila_facil_after_auth_user_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fila_facil_create_user_profile();
