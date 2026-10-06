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
  const { isAuthenticated } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="chat" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
}