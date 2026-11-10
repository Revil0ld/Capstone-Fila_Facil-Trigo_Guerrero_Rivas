import { getSupabaseClient } from '@/supabase/supabaseClient';

export type AccountProfile = {
  fullName: string;
  email: string;
  phone: string;
  region: string;
  comuna: string;
  street: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function getAccountProfile(): Promise<AccountProfile> {
  const { data, error } = await getSupabaseClient().rpc('obtener_perfil_cuenta');
  if (error) {
    throw new Error(
      `No se pudo cargar tu perfil. Verifica que esté aplicada la migración 20261018000005_account_profile_settings.sql. ${error.message}`
    );
  }
  if (!Array.isArray(data) || !isRecord(data[0])) {
    throw new Error('Supabase devolvió un perfil vacío o con un formato inesperado.');
  }

  const row = data[0];
  if (
    typeof row.nombre !== 'string' ||
    typeof row.correo !== 'string' ||
    (typeof row.telefono !== 'string' && row.telefono !== null) ||
    (typeof row.region !== 'string' && row.region !== null) ||
    (typeof row.comuna !== 'string' && row.comuna !== null) ||
    (typeof row.calle !== 'string' && row.calle !== null)
  ) {
    throw new Error('Supabase devolvió datos de perfil incompletos.');
  }

  return {
    fullName: row.nombre,
    email: row.correo,
    phone: row.telefono ?? '',
    region: row.region ?? '',
    comuna: row.comuna ?? '',
    street: row.calle ?? '',
  };
}

export async function saveAccountProfile(profile: AccountProfile) {
  const { error } = await getSupabaseClient().rpc('actualizar_perfil_cuenta', {
    p_nombre: profile.fullName.trim(),
    p_telefono: profile.phone.trim(),
    p_region: profile.region.trim(),
    p_comuna: profile.comuna.trim(),
    p_calle: profile.street.trim(),
  });
  if (error) {
    throw new Error(`No se pudo guardar tu perfil. ${error.message}`);
  }
}
