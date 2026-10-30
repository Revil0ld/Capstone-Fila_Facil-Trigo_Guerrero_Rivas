import '@/tasks/customer-presence-task';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SessionProvider, useSession } from '@/context/auth';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

/* Segmento para la raíz de la navegación */
export default function RootLayout() {
  return (
    <SessionProvider>
      <AnimatedSplashOverlay />
      <RootNavigator />
    </SessionProvider>
  );
}



/* Segmento para proteger las rutas según la sesión */
function RootNavigator() {
  const {
    isAuthenticated,
    isInitialized,
    isAdmin,
    isBanned,
    isAccessLoading,
    accessError,
  } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected
        guard={isInitialized && isAuthenticated && (isAccessLoading || accessError !== null)}
      >
        <Stack.Screen name="access-check" />
      </Stack.Protected>

      <Stack.Protected
        guard={
          isInitialized &&
          isAuthenticated &&
          !isAccessLoading &&
          accessError === null &&
          isBanned
        }
      >
        <Stack.Screen name="account-banned" />
      </Stack.Protected>

      <Stack.Protected
        guard={
          isInitialized &&
          isAuthenticated &&
          !isAccessLoading &&
          accessError === null &&
          !isBanned
        }
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="chat" />
      </Stack.Protected>

      <Stack.Protected
        guard={
          isInitialized &&
          isAuthenticated &&
          !isAccessLoading &&
          accessError === null &&
          !isBanned &&
          isAdmin
        }
      >
        <Stack.Screen name="admin" />
      </Stack.Protected>

      <Stack.Protected guard={!isInitialized || !isAuthenticated}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}