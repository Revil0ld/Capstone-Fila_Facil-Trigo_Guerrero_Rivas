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
import {
  ALL_OCCUPANCY_FILTER_LEVELS,
  type OccupancyFilterLevel,
} from '@/lib/supermarket-occupancy';
import { CrowdFilterMenu } from './crowd-filter-menu';
import { ChainFilterMenu } from './chain-filter-menu';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';

type MapSearchContextValue = {
  onSearch: (() => void) | null;
  setOnSearch: (handler: (() => void) | null) => void;
  selectedOccupancyLevels: OccupancyFilterLevel[];
  setSelectedOccupancyLevels: (levels: OccupancyFilterLevel[]) => void;
  supermarketChains: string[];
  setSupermarketChains: (chains: string[]) => void;
  selectedSupermarketChain: string | null;
  setSelectedSupermarketChain: (chain: string | null) => void;
};

const MapSearchContext = createContext<MapSearchContextValue | null>(null);

export function useMapSearchRegistration() {
  const context = useContext(MapSearchContext);
  if (!context) {
    throw new Error('useMapSearchRegistration must be used inside AppTabs');
  }

  return context.setOnSearch;
}

export function useOccupancyFilterSelection() {
  const context = useContext(MapSearchContext);
  if (!context) {
    throw new Error('useOccupancyFilterSelection must be used inside AppTabs');
  }

  return {
    selectedLevels: context.selectedOccupancyLevels,
    setSelectedLevels: context.setSelectedOccupancyLevels,
  };
}

export function useSupermarketChainFilter() {
  const context = useContext(MapSearchContext);
  if (!context) {
    throw new Error('useSupermarketChainFilter must be used inside AppTabs');
  }

  return {
    chains: context.supermarketChains,
    setChains: context.setSupermarketChains,
    selectedChain: context.selectedSupermarketChain,
    setSelectedChain: context.setSelectedSupermarketChain,
  };
}

/* Segmento para los botones de pestaña */
export default function AppTabs() {
  const { signOut } = useSession();
  const [onSearch, setOnSearch] = useState<(() => void) | null>(null);
  const [selectedOccupancyLevels, setSelectedOccupancyLevels] =
    useState<OccupancyFilterLevel[]>(ALL_OCCUPANCY_FILTER_LEVELS);
  const [supermarketChains, setSupermarketChains] = useState<string[]>([]);
  const [selectedSupermarketChain, setSelectedSupermarketChain] = useState<string | null>(null);
  const registerSearchAction = useCallback(
    (handler: (() => void) | null) => setOnSearch(() => handler),
    []
  );

  return (
    <MapSearchContext.Provider
      value={{
        onSearch,
        setOnSearch: registerSearchAction,
        selectedOccupancyLevels,
        setSelectedOccupancyLevels,
        supermarketChains,
        setSupermarketChains,
        selectedSupermarketChain,
        setSelectedSupermarketChain,
      }}>
      <Tabs>
        <TabSlot style={{ height: '100%' }} />
        <TabList asChild>
          <CustomTabList>
            <TabTrigger name="index" href="/(app)" asChild>
              <TabButton>Inicio</TabButton>
            </TabTrigger>
            <TabTrigger name="map" href="/map" asChild>
              <TabButton>Mapa</TabButton>
            </TabTrigger>
            <TabTrigger name="log out" asChild>
              <TabButton
                onPress={() => {
                  void signOut().catch((error: unknown) => {
                    console.error('No se pudo cerrar sesión en Supabase:', error);
                  });
                }}>
                Cerrar sesión
              </TabButton>
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

        <CrowdFilterMenu
          selectedLevels={context?.selectedOccupancyLevels ?? ALL_OCCUPANCY_FILTER_LEVELS}
          onToggleLevel={(level) => {
            const selected = context?.selectedOccupancyLevels ?? ALL_OCCUPANCY_FILTER_LEVELS;
            context?.setSelectedOccupancyLevels(
              selected.includes(level)
                ? selected.filter((selectedLevel) => selectedLevel !== level)
                : [...selected, level]
            );
          }}
          onReset={() => context?.setSelectedOccupancyLevels(ALL_OCCUPANCY_FILTER_LEVELS)}
        />
        <ChainFilterMenu
          chains={context?.supermarketChains ?? []}
          selectedChain={context?.selectedSupermarketChain ?? null}
          onSelectChain={(chain) => context?.setSelectedSupermarketChain(chain)}
        />
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
