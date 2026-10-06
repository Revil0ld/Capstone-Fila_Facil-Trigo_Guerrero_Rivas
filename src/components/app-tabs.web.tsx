import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import { createContext, useCallback, useContext, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/context/auth';
import { CrowdFilterMenu } from './crowd-filter-menu';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';

type MapSearchContextValue = {
  onSearch: (() => void) | null;
  setOnSearch: (handler: (() => void) | null) => void;
};

const MapSearchContext = createContext<MapSearchContextValue | null>(null);

export function useMapSearchRegistration() {
  const context = useContext(MapSearchContext);
  if (!context) {
    throw new Error('useMapSearchRegistration must be used inside AppTabs');
  }

  return context.setOnSearch;
}

/* Segmento para los botones de pestaña */
export default function AppTabs() {
  const { signOut } = useSession();
  const [onSearch, setOnSearch] = useState<(() => void) | null>(null);
  const registerSearchAction = useCallback(
    (handler: (() => void) | null) => setOnSearch(() => handler),
    []
  );

  return (
    <MapSearchContext.Provider value={{ onSearch, setOnSearch: registerSearchAction }}>
      <Tabs>
        <TabSlot style={{ height: '100%' }} />
        <TabList asChild>
          <CustomTabList>
            <TabTrigger name="log out" asChild>
              <TabButton onPress={signOut}>Cerrar sesión</TabButton>
            </TabTrigger>
            <TabTrigger name="map" href="/map" asChild>
              <TabButton>Mapa</TabButton>
            </TabTrigger>
          </CustomTabList>
        </TabList>
      </Tabs>
    </MapSearchContext.Provider>
  );
}

/* Segmento para los botones de pestaña */
export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

/* Segmento para la lista de pestañas personalizada */
export function CustomTabList(props: TabListProps) {
  const context = useContext(MapSearchContext);

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar supermercados en esta zona del mapa"
          disabled={!context?.onSearch}
          onPress={() => context?.onSearch?.()}
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
        >
          <ThemedText type="smallBold" style={styles.brandText}>
            Buscar en esta Zona
          </ThemedText>
        </Pressable>

        <CrowdFilterMenu />
        {props.children}

        
      </ThemedView>
    </View>
  );
}

/* Segmento para los estilos de los componentes de pestañas */
const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: Spacing.three,
  },
  searchButton: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});
