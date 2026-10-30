BEGIN;

CREATE TABLE IF NOT EXISTS public.super_usuario_presencia (
  id_usuario uuid NOT NULL REFERENCES public.usuario (id_usuario) ON DELETE CASCADE,
  id_super uuid NOT NULL REFERENCES public.super (id_super) ON DELETE CASCADE,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_usuario, id_super)
);

CREATE INDEX IF NOT EXISTS super_usuario_presencia_super_recent_idx
  ON public.super_usuario_presencia (id_super, actualizado_en);

CREATE INDEX IF NOT EXISTS super_usuario_presencia_updated_idx
  ON public.super_usuario_presencia (actualizado_en);

ALTER TABLE public.super_usuario_presencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.super_usuario_presencia FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.obtener_aforo_supermercados(p_ids_super uuid[])
RETURNS TABLE (id_super uuid, cantidad integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.actualizar_presencia_por_ubicacion(
  p_latitud numeric,
  p_longitud numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION public.obtener_aforo_supermercados(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_presencia_por_ubicacion(numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_aforo_supermercados(uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_presencia_por_ubicacion(numeric, numeric)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
