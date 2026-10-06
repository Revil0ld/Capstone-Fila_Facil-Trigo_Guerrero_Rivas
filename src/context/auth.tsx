import { createContext, use, useCallback, useMemo, useState, type PropsWithChildren } from 'react';

export type Session = {
  email: string;
  signedInAt: number;
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Simulated network latency so the login UI can show a loading state. */
const SIGN_IN_DELAY_MS = 700;

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
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // TODO: replace with a real authentication request.
      await new Promise((resolve) => setTimeout(resolve, SIGN_IN_DELAY_MS));
      if (!email.trim() || !password) {
        throw new Error('Credenciales incompletas');
      }
      setSession({ email: email.trim(), signedInAt: Date.now() });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
  }, []);

  const signRegister = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // TODO: replace with a real registration request.
      await new Promise((resolve) => setTimeout(resolve, SIGN_IN_DELAY_MS));
      if (!email.trim() || !password) {
        throw new Error('Credenciales incompletas');
      }
      setSession({ email: email.trim(), signedInAt: Date.now() });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: session !== null, isLoading, signIn, signOut, signRegister }),
    [session, isLoading, signIn, signOut, signRegister]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}