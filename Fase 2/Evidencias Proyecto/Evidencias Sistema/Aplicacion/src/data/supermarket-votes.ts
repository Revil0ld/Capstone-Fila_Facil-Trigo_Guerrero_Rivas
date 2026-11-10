import * as Location from 'expo-location';

import { getSupabaseClient } from '@/supabase/supabaseClient';
import type { Supermarket } from '@/data/supermarkets';
import { haversineKm, type Coords } from '@/lib/geo';

export type SupermarketFilterVotes = {
  id: string;
  label: string;
  positiveVotes: number;
  negativeVotes: number;
  myVote: -1 | 1 | null;
};

export type SupermarketFilterVotesResult = {
  votes: SupermarketFilterVotes[];
  warning: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function synchronizeOsmSupermarket(store: Supermarket) {
  const { data, error } = await getSupabaseClient().rpc('sincronizar_supermercado_osm', {
    p_osm_ref: store.osmRef,
    p_nombre: store.name,
    p_cadena: store.chain,
    p_region: store.region,
    p_comuna: store.comuna,
    p_calle: store.street,
    p_latitud: store.latitude,
    p_longitud: store.longitude,
  });

  if (error) {
    throw new Error(
      `No se pudo sincronizar este supermercado con la base de datos. Ejecuta la migración supabase/migrations/20261017000001_sync_osm_supermarkets_and_votes.sql. ${error.message}`
    );
  }
  if (typeof data !== 'string') {
    throw new Error('Supabase no devolvió el identificador del supermercado sincronizado.');
  }

  return data;
}

export function getSupermarketDatabaseId(store: Supermarket) {
  return store.databaseId ? Promise.resolve(store.databaseId) : synchronizeOsmSupermarket(store);
}

export async function getSupermarketFilterVotes(
  supermarketId: string
): Promise<SupermarketFilterVotesResult> {
  const { data, error } = await getSupabaseClient().rpc('obtener_votos_supermercado', {
    p_id_super: supermarketId,
  });
  if (!error && Array.isArray(data)) {
    const votes = data.map((item): SupermarketFilterVotes => {
      if (
        !isRecord(item) ||
        typeof item.id_filtro !== 'string' ||
        typeof item.tipo !== 'string' ||
        typeof item.votos_positivos !== 'number' ||
        typeof item.votos_negativos !== 'number' ||
        (item.mi_voto !== null && item.mi_voto !== 1 && item.mi_voto !== -1)
      ) {
        throw new Error('Un criterio de votación llegó en un formato inesperado.');
      }

      return {
        id: item.id_filtro,
        label: item.tipo,
        positiveVotes: item.votos_positivos,
        negativeVotes: item.votos_negativos,
        myVote: item.mi_voto,
      };
    });

    return { votes, warning: null };
  }

  throw new Error(
    `No se pudieron cargar los votos del supermercado. Verifica que esté instalada la migración de votación. ${error?.message ?? 'Supabase devolvió una respuesta inesperada.'}`
  );
}

export async function submitSupermarketFilterVote(
  supermarketId: string,
  filterId: string,
  vote: -1 | 1,
  position: Coords
) {
  const { error } = await getSupabaseClient().rpc('registrar_voto_supermercado', {
    p_id_super: supermarketId,
    p_id_filtro: filterId,
    p_voto: vote,
    p_latitud: position.latitude,
    p_longitud: position.longitude,
  });

  if (error) {
    throw error;
  }
}

/** Distancia máxima al supermercado para considerar que el usuario está dentro como cliente. */
export const VOTE_MAX_DISTANCE_METERS = 150;

export type StorePresence =
  | { status: 'inside'; position: Coords }
  | { status: 'outside'; distanceMeters: number }
  | { status: 'unknown'; reason: string };

export async function checkUserInsideSupermarket(
  store: Pick<Supermarket, 'latitude' | 'longitude'>
): Promise<StorePresence> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return {
        status: 'unknown',
        reason: 'Activa el permiso de ubicación para confirmar que estás dentro del supermercado.',
      };
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const position = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
    const distanceMeters = haversineKm(position, store) * 1000;

    return distanceMeters <= VOTE_MAX_DISTANCE_METERS
      ? { status: 'inside', position }
      : { status: 'outside', distanceMeters };
  } catch {
    return {
      status: 'unknown',
      reason: 'No se pudo obtener tu ubicación para confirmar que estás dentro del supermercado.',
    };
  }
}
