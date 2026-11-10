-- Elimina los supermercados que no pertenecen a las marcas con logo
-- (A Cuenta, Jumbo, Líder, Santa Isabel, Super 10/Mayorista 10, Tottus, Alvi, Unimarc, Montserrat).
-- Los locales con referencia OSM se registran como excluidos para que no vuelvan al importar.

CREATE TEMP TABLE _super_a_eliminar ON COMMIT DROP AS
SELECT super_row.id_super, super_row.id_direccion_s, super_row.osm_ref
FROM public.super AS super_row
WHERE regexp_replace(
        translate(
          lower(coalesce(super_row.tipo::text, '') || coalesce(super_row.nombre::text, '')),
          'áéíóúüñ', 'aeiouun'
        ),
        '[^a-z0-9]', '', 'g'
      ) !~ '(acuenta|jumbo|lider|santaisabel|super10|mayorista10|tottus|alvi|unimarc|montserrat)';

INSERT INTO public.supermercado_catalogo_excluido (osm_ref)
SELECT DISTINCT osm_ref FROM _super_a_eliminar WHERE osm_ref IS NOT NULL
ON CONFLICT (osm_ref) DO NOTHING;

DELETE FROM public.voto_filtro WHERE id_super IN (SELECT id_super FROM _super_a_eliminar);
DELETE FROM public.filtro_super WHERE id_super IN (SELECT id_super FROM _super_a_eliminar);
DELETE FROM public.super_usuario_presencia WHERE id_super IN (SELECT id_super FROM _super_a_eliminar);
DELETE FROM public.chat_mensaje_supermercado WHERE id_super IN (SELECT id_super FROM _super_a_eliminar);
DELETE FROM public.super WHERE id_super IN (SELECT id_super FROM _super_a_eliminar);

DELETE FROM public.direccion_super AS address_row
WHERE address_row.id_direccion_s IN (SELECT id_direccion_s FROM _super_a_eliminar)
  AND NOT EXISTS (
    SELECT 1 FROM public.super AS remaining_store
    WHERE remaining_store.id_direccion_s = address_row.id_direccion_s
  );
