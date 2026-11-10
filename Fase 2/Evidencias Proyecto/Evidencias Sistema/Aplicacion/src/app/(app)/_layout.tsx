import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';

// Tras iniciar sesión la app abre el mapa, no el inicio.
export const unstable_settings = { initialRouteName: 'map' };

/* Segmento para la configuración del diseño de pestañas (rutas autenticadas) */
export default function AppLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}