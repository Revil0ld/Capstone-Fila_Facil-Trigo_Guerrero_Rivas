import type * as Location from 'expo-location';

import { getSupabaseClient } from '@/supabase/supabaseClient';

export async function updateCustomerPresence(location: Location.LocationObject | null) {
  const { error } = await getSupabaseClient().rpc('actualizar_presencia_por_ubicacion', {
    p_latitud: location?.coords.latitude ?? null,
    p_longitud: location?.coords.longitude ?? null,
  });

  if (error) {
    throw new Error(`No se pudo actualizar tu presencia en el supermercado. ${error.message}`);
  }
}
