import { Colors } from '@/constants/theme';
import { useSession } from '@/context/auth';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

/* Segmento para los estilos de los componentes de pestañas */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { signOut } = useSession();

/* Segmento para los botones de pestaña */
  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Label>Mapa</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map.fill" md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="logout"
        accessibilityLabel="Cerrar sesión"
        listeners={{ tabPress: signOut }}>
        <NativeTabs.Trigger.Label>Cerrar sesión</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="rectangle.portrait.and.arrow.right" md="logout" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
