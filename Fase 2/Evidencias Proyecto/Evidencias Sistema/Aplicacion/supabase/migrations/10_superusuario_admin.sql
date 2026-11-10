BEGIN;

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'usuario';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS role_constraint
    WHERE role_constraint.conrelid = 'public.usuario'::regclass
      AND role_constraint.conname = 'usuario_rol_valid'
  ) THEN
    ALTER TABLE public.usuario
      ADD CONSTRAINT usuario_rol_valid
      CHECK (rol IN ('usuario', 'admin'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.es_superusuario()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario AS usuario_row
    WHERE usuario_row.auth_id = auth.uid()
      AND usuario_row.rol = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.fila_facil_assign_initial_superuser()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

DROP TRIGGER IF EXISTS zzzz_fila_facil_assign_initial_superuser ON auth.users;
CREATE TRIGGER zzzz_fila_facil_assign_initial_superuser
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fila_facil_assign_initial_superuser();

UPDATE public.usuario AS usuario_row
SET rol = 'admin'
FROM auth.users AS auth_user
WHERE usuario_row.auth_id = auth_user.id
  AND pg_catalog.lower(pg_catalog.btrim(COALESCE(auth_user.email, ''))) = 'filafacil.org@gmail.com';

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
    (SELECT pg_catalog.count(*) FROM public.super),
    (SELECT pg_catalog.count(*) FROM public.chat_mensaje_supermercado);
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_mensajes_admin()
RETURNS TABLE (
  id_mensaje bigint,
  id_super uuid,
  nombre_supermercado text,
  nombre_usuario text,
  mensaje text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.eliminar_mensaje_admin(p_id_mensaje bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.es_superusuario()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fila_facil_assign_initial_superuser()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_resumen_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_mensajes_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_mensaje_admin(bigint)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.es_superusuario()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_mensajes_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_mensaje_admin(bigint)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
