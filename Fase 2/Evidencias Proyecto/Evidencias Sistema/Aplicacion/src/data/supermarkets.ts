import { getSupabaseClient } from '@/supabase/supabaseClient';
import { haversineKm, type Coords } from '@/lib/geo';

export type Supermarket = {
  id: string;
  osmRef: string;
  databaseId?: string | null;
  occupancyPercent?: number | null;
  name: string;
  chain: string;
  address: string;
  region: string;
  comuna: string;
  street: string;
  latitude: number;
  longitude: number;
};

export type NearbySupermarket = Supermarket & { distanceKm: number };

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/** Returns the current occupancy percentage by supermarket id. */
export async function getSupermarketOccupancies(
  supermarketIds: string[],
  signal?: AbortSignal
): Promise<Map<string, number>> {
  const occupancies = new Map<string, number>();
  if (supermarketIds.length === 0) {
    return occupancies;
  }

  const request = getSupabaseClient().rpc('obtener_aforo_supermercados', {
    p_ids_super: supermarketIds,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error || !Array.isArray(data)) {
    throw new Error(error?.message ?? 'Supabase devolvió un aforo con formato inesperado.');
  }

  for (const item of data) {
    if (isRecord(item) && typeof item.id_super === 'string' && typeof item.cantidad === 'number') {
      occupancies.set(item.id_super, item.cantidad);
    }
  }
  return occupancies;
}

/** Loads supermarkets already stored in Supabase for the visible map area. */
export async function getNearbySupermarkets(
  bounds: MapBounds,
  origin: Coords,
  signal?: AbortSignal
): Promise<NearbySupermarket[]> {
  const request = getSupabaseClient()
    .rpc('obtener_supermercados_en_zona', {
      p_south: bounds.south,
      p_west: bounds.west,
      p_north: bounds.north,
      p_east: bounds.east,
    });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);

  if (error) {
    throw new Error(
      `No se pudieron buscar supermercados guardados. Verifica que esté instalada la migración supabase/migrations/20261024000001_supermarkets_in_map_area.sql. ${error.message}`
    );
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió un formato inesperado al buscar supermercados.');
  }

  return data
    .filter(isRecord)
    .map((item) => {
      const latitude = item.latitud;
      const longitude = item.longitud;
      if (
        typeof item.id_super !== 'string' ||
        typeof item.osm_ref !== 'string' ||
        typeof item.nombre !== 'string' ||
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        throw new Error('Supabase devolvió un supermercado con datos inválidos.');
      }

      const id = item.id_super;
      const name = item.nombre;
      const chain = getText(item.cadena, name);
      const region = getText(item.region);
      const comuna = getText(item.comuna);
      const street = getText(item.calle);

      return {
        id,
        databaseId: id,
        osmRef: item.osm_ref,
        name,
        chain,
        address: [street, comuna].filter(Boolean).join(', ') || 'Dirección no disponible',
        region,
        comuna,
        street,
        latitude,
        longitude,
        distanceKm: haversineKm(origin, { latitude, longitude }),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
