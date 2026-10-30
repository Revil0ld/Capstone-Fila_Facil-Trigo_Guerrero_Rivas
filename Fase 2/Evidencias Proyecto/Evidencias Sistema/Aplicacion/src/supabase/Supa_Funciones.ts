import { getSupabaseClient } from './supabaseClient';

export type RegistrationProfile = {
  fullName: string;
  phone: string;
  region: string;
  comuna: string;
  calle: string;
  latitude: number;
  longitude: number;
};

export async function signUp(
  email: string,
  password: string,
  profile: RegistrationProfile
) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      data: {
        fila_facil_registration: true,
        full_name: profile.fullName,
        phone: profile.phone,
        region: profile.region,
        comuna: profile.comuna,
        calle: profile.calle,
        latitude: profile.latitude,
        longitude: profile.longitude,
      },
    },
  });

  if (error) throw error;
  if (data.user && data.user.identities?.length === 0) {
    throw new Error('Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.');
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}