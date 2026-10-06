import { haversineKm, type Coords } from '@/lib/geo';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const RESPONSE_CACHE_MS = 2 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; stores: NearbySupermarket[] }>();

export type Supermarket = {
  id: string;
  name: string;
  chain: string;
  address: string;
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

function getTag(tags: Record<string, unknown>, key: string) {
  const value = tags[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getAddress(tags: Record<string, unknown>) {
  const fullAddress = getTag(tags, 'addr:full');
  if (fullAddress) {
    return fullAddress;
  }

  const street = [getTag(tags, 'addr:street'), getTag(tags, 'addr:housenumber')]
    .filter(Boolean)
    .join(' ');
  const locality =
    getTag(tags, 'addr:suburb') ||
    getTag(tags, 'addr:city') ||
    getTag(tags, 'addr:place');
  const address = [street, locality].filter(Boolean).join(', ');

  return address || 'Dirección no disponible';
}

function parseStore(element: Record<string, unknown>): Supermarket | null {
  const tags = isRecord(element.tags) ? element.tags : null;
  const center = isRecord(element.center) ? element.center : null;
  const latitude = typeof element.lat === 'number' ? element.lat : center?.lat;
  const longitude = typeof element.lon === 'number' ? element.lon : center?.lon;
  const name = tags
    ? getTag(tags, 'name') || getTag(tags, 'brand') || getTag(tags, 'operator')
    : '';

  if (
    !tags ||
    !name ||
    typeof element.id !== 'number' ||
    typeof element.type !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    chain: getTag(tags, 'brand') || getTag(tags, 'operator') || name,
    address: getAddress(tags),
    latitude,
    longitude,
  };
}

/** Loads real supermarkets mapped in OpenStreetMap for the currently visible map area. */
export async function getNearbySupermarkets(
  bounds: MapBounds,
  origin: Coords,
  signal?: AbortSignal
): Promise<NearbySupermarket[]> {
  const cacheKey = [...Object.values(bounds), origin.latitude, origin.longitude]
    .map((value) => value.toFixed(4))
    .join(',');
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.stores;
  }

  const center: Coords = {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  };
  const radiusMeters = Math.ceil(
    Math.max(
      haversineKm(center, { latitude: bounds.south, longitude: bounds.west }),
      haversineKm(center, { latitude: bounds.south, longitude: bounds.east }),
      haversineKm(center, { latitude: bounds.north, longitude: bounds.west }),
      haversineKm(center, { latitude: bounds.north, longitude: bounds.east })
    ) * 1000
  );
  const query = `
    [out:json][timeout:20];
    (
      node["shop"="supermarket"](around:${radiusMeters},${center.latitude},${center.longitude});
      way["shop"="supermarket"](around:${radiusMeters},${center.latitude},${center.longitude});
      relation["shop"="supermarket"](around:${radiusMeters},${center.latitude},${center.longitude});
    );
    out center tags 500;
  `;

  const failures: string[] = [];
  let receivedEmptyResponse = false;

  for (const [index, endpoint] of OVERPASS_ENDPOINTS.entries()) {
    if (signal?.aborted) {
      throw new Error('La búsqueda de supermercados fue cancelada.');
    }

    const requestController = new AbortController();
    let timedOut = false;
    const abortRequest = () => requestController.abort();
    signal?.addEventListener('abort', abortRequest, { once: true });
    const requestTimeout = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, 25_000);

    try {
      const url = new URL(endpoint);
      url.searchParams.set('data', query);
      const response = await fetch(url, { signal: requestController.signal });

      if (!response.ok) {
        throw new Error(`OpenStreetMap respondió con el error ${response.status}.`);
      }

      const payload: unknown = await response.json();

      if (!isRecord(payload) || !Array.isArray(payload.elements)) {
        throw new Error('OpenStreetMap devolvió una respuesta con formato inesperado.');
      }

      const stores = payload.elements
        .filter(isRecord)
        .map(parseStore)
        .filter((store): store is Supermarket => store !== null)
        .filter(
          (store) =>
            store.latitude >= bounds.south &&
            store.latitude <= bounds.north &&
            store.longitude >= bounds.west &&
            store.longitude <= bounds.east
        )
        .map((store) => ({
          ...store,
          distanceKm: haversineKm(origin, store),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);

      if (stores.length === 0 && index > 0) {
        receivedEmptyResponse = true;
        continue;
      }

      if (stores.length > 0) {
        responseCache.set(cacheKey, {
          expiresAt: Date.now() + RESPONSE_CACHE_MS,
          stores,
        });
      }
      return stores;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      const reason = timedOut
        ? 'la consulta agotó el tiempo de espera'
        : error instanceof Error
          ? error.message
          : 'falló la conexión';
      failures.push(`${new URL(endpoint).hostname}: ${reason}`);
    } finally {
      clearTimeout(requestTimeout);
      signal?.removeEventListener('abort', abortRequest);
    }
  }

  if (receivedEmptyResponse) {
    return [];
  }

  throw new Error(`No se pudieron cargar supermercados desde OpenStreetMap. ${failures.join('; ')}`);
}
