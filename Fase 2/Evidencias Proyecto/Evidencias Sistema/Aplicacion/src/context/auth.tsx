import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { getAccountAccessStatus } from '@/data/admin';
import {
  signIn as signInWithSupabase,
  signOut as signOutFromSupabase,
  signUp as signUpWithSupabase,
  type RegistrationProfile,
} from '@/supabase/Supa_Funciones';
import { getSupabaseClient, isSupabaseConfigured } from '@/supabase/supabaseClient';

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  isChatBanned: boolean;
  isAccessLoading: boolean;
  accessError: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    profile: RegistrationProfile
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshAccountAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to read and mutate the current session.
 * Docs: https://docs.expo.dev/router/advanced/authentication
 */
export function useSession() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }

  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [bannedUserId, setBannedUserId] = useState<string | null>(null);
  const [chatBannedUserId, setChatBannedUserId] = useState<string | null>(null);
  const [accessCheckedUserId, setAccessCheckedUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const {
      data: { subscription },
    } = getSupabaseClient().auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsInitialized(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!session) {
      return;
    }

    const checkAccess = async () => {
      try {
        const status = await getAccountAccessStatus();
        if (isActive) {
          setAdminUserId(status.isAdmin ? session.user.id : null);
          setBannedUserId(status.isBanned ? session.user.id : null);
          setChatBannedUserId(status.isChatBanned ? session.user.id : null);
          setAccessError(null);
          setAccessCheckedUserId(session.user.id);
        }
      } catch (error: unknown) {
        console.error('No se pudo verificar el rol administrador.', error);
        if (isActive) {
          setAdminUserId(null);
          setBannedUserId(null);
          setChatBannedUserId(null);
          setAccessError(
            error instanceof Error ? error.message : 'No se pudo verificar tu cuenta.'
          );
          setAccessCheckedUserId(session.user.id);
        }
      }
    };
    void checkAccess();
    const interval = setInterval(() => void checkAccess(), 30_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [session]);

  const refreshAccountAccess = useCallback(async () => {
    if (!session) {
      return;
    }
    try {
      const status = await getAccountAccessStatus();
      setAdminUserId(status.isAdmin ? session.user.id : null);
      setBannedUserId(status.isBanned ? session.user.id : null);
      setChatBannedUserId(status.isChatBanned ? session.user.id : null);
      setAccessError(null);
      setAccessCheckedUserId(session.user.id);
    } catch (error: unknown) {
      setAccessError(
        error instanceof Error ? error.message : 'No se pudo verificar tu cuenta.'
      );
      setAccessCheckedUserId(session.user.id);
      throw error;
    }
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { session: signedInSession } = await signInWithSupabase(email.trim(), password);
      if (!signedInSession) {
        throw new Error('No se pudo iniciar sesión. Inténtalo nuevamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isAdmin = session !== null && adminUserId === session.user.id;
  const isBanned = session !== null && bannedUserId === session.user.id;
  const isChatBanned = session !== null && chatBannedUserId === session.user.id;
  const isAccessLoading = session !== null && accessCheckedUserId !== session.user.id;

  const signOut = useCallback(async () => {
    await signOutFromSupabase();
  }, []);

  const register = useCallback(
    async (email: string, password: string, profile: RegistrationProfile) => {
      setIsLoading(true);
      try {
        const { session: registeredSession } = await signUpWithSupabase(
          email.trim(),
          password,
          {
            ...profile,
            fullName: profile.fullName.trim(),
            phone: profile.phone.trim(),
            region: profile.region.trim(),
            comuna: profile.comuna.trim(),
            calle: profile.calle.trim(),
          }
        );
        return { requiresEmailConfirmation: registeredSession === null };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      isAdmin,
      isBanned,
      isChatBanned,
      isAccessLoading,
      accessError,
      isLoading,
      isInitialized,
      signIn,
      signUp: register,
      signOut,
      refreshAccountAccess,
    }),
    [
      session,
      isAdmin,
      isBanned,
      isChatBanned,
      isAccessLoading,
      accessError,
      isLoading,
      isInitialized,
      signIn,
      register,
      signOut,
      refreshAccountAccess,
    ]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}