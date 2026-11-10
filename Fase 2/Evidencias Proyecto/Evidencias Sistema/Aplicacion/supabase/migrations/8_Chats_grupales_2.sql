BEGIN;

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

  SELECT usuario_row.id_usuario
  INTO v_usuario_id
  FROM public.usuario AS usuario_row
  WHERE usuario_row.auth_id = auth.uid();

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un perfil de usuario para enviar mensajes.';
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
  RETURNING inserted_row.id_mensaje
  INTO v_mensaje_id;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
