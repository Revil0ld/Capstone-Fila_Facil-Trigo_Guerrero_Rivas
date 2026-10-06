import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { CrowdFilterMenu } from '@/components/crowd-filter-menu';
import { SupermarketCard } from '@/components/supermarket-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MapBounds } from '@/data/supermarkets';
import { useCurrentLocation } from '@/hooks/use-location';
import { useNearbySupermarkets } from '@/hooks/use-nearby-supermarkets';
import { useTheme } from '@/hooks/use-theme';

type MapMessage =
  | { type: 'bounds'; bounds: MapBounds }
  | { type: 'select'; storeId: string }
  | { type: 'tile-error' }
  | { type: 'map-load-error' };

function createMapHtml(latitude: number, longitude: number) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
      .store-icon { display:flex; width:38px; height:38px; align-items:center; justify-content:center;
        border:3px solid white; border-radius:50%; background:#208AEF; box-shadow:0 2px 8px #0006;
        font-size:19px; }
      .user-icon { display:flex; width:20px; height:20px; align-items:center; justify-content:center;
        border:3px solid white; border-radius:50%; background:#208AEF; box-shadow:0 2px 8px #0006; }
      .user-icon span { width:6px; height:6px; border-radius:50%; background:white; }
      .leaflet-control-zoom { margin-top:156px !important; }
    </style>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  </head>
  <body>
    <div id="map"></div>
    <script>
      if (!window.L) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map-load-error' }));
      } else {
      const map = L.map('map', { zoomControl: false }).setView([${latitude}, ${longitude}], 14);
      L.control.zoom({ position: 'topleft' }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }).addTo(map).on('tileerror', () => sendMessage({ type: 'tile-error' }));
      L.marker([${latitude}, ${longitude}], {
        title: 'Tu ubicación',
        icon: L.divIcon({
          className: '',
          html: '<span class="user-icon"><span></span></span>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      }).addTo(map);

      const storeMarkers = L.layerGroup().addTo(map);
      const sendMessage = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
      const sendBounds = () => {
        const bounds = map.getBounds();
        sendMessage({
          type: 'bounds',
          bounds: {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast()
          }
        });
      };

      map.on('moveend', sendBounds);
      map.whenReady(sendBounds);
      window.renderStores = (stores, selectedId) => {
        storeMarkers.clearLayers();
        stores.forEach((store) => {
          const marker = L.marker([store.latitude, store.longitude], {
            icon: L.divIcon({
              className: '',
              html: '<span class="store-icon" style="background:' +
                (store.id === selectedId ? '#145DA0' : '#208AEF') + '">🛒</span>',
              iconSize: [38, 38],
              iconAnchor: [19, 19]
            })
          }).addTo(storeMarkers);
          marker.on('click', () => sendMessage({ type: 'select', storeId: store.id }));
        });
      };
      }
    </script>
  </body>
</html>`;
}

function isMapMessage(value: unknown): value is MapMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  const message = value as Record<string, unknown>;
  if (message.type === 'tile-error' || message.type === 'map-load-error') {
    return true;
  }
  if (message.type === 'select') {
    return typeof message.storeId === 'string';
  }
  if (message.type !== 'bounds' || typeof message.bounds !== 'object' || message.bounds === null) {
    return false;
  }

  const bounds = message.bounds as Record<string, unknown>;
  return ['south', 'west', 'north', 'east'].every(
    (key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key])
  );
}

export default function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { coords, isLoading: isLocationLoading } = useCurrentLocation();
  const webViewRef = useRef<WebView>(null);
  const initialSearchStarted = useRef(false);
  const [visibleBounds, setVisibleBounds] = useState<MapBounds | null>(null);
  const [searchBounds, setSearchBounds] = useState<MapBounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const { stores, isLoading: areStoresLoading, error: storesError } =
    useNearbySupermarkets(searchBounds, coords);

  const mapHtml = useMemo(
    () => (coords ? createMapHtml(coords.latitude, coords.longitude) : ''),
    [coords]
  );

  useEffect(() => {
    if (!mapLoaded) {
      return;
    }

    const storesForMap = stores.map(({ id, latitude, longitude }) => ({
      id,
      latitude,
      longitude,
    }));
    const script = `window.renderStores && window.renderStores(${JSON.stringify(storesForMap)}, ${JSON.stringify(selectedId)}); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, [mapLoaded, selectedId, stores]);

  function handleMapMessage(event: WebViewMessageEvent) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      setMapError('No se pudo leer la respuesta del mapa.');
      return;
    }

    if (!isMapMessage(parsed)) {
      setMapError('El mapa envió datos con un formato inesperado.');
      return;
    }

    if (parsed.type === 'select') {
      setSelectedId(parsed.storeId);
      return;
    }

    if (parsed.type === 'tile-error') {
      setMapError('No se pudieron cargar algunos mosaicos del mapa. Revisa la conexión.');
      return;
    }

    if (parsed.type === 'map-load-error') {
      setMapError('No se pudo cargar Leaflet. Revisa la conexión e inténtalo de nuevo.');
      return;
    }

    setVisibleBounds(parsed.bounds);
    if (!initialSearchStarted.current) {
      initialSearchStarted.current = true;
      setSearchBounds(parsed.bounds);
    }
  }

  function handleSearch() {
    if (visibleBounds) {
      setSelectedId(null);
      setSearchBounds({ ...visibleBounds });
    }
  }

  const selectedStore = stores.find((store) => store.id === selectedId) ?? null;

  if (!coords) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={theme.primary} />
        <ThemedText type="small" themeColor="textSecondary">
          {isLocationLoading ? 'Obteniendo tu ubicación…' : 'Ubicación no disponible'}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml, baseUrl: 'https://filafacil.app' }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        userAgent="FilaFacil/1.0"
        onMessage={handleMapMessage}
        onLoadEnd={() => {
          setMapLoaded(true);
          setMapError(null);
        }}
        onError={(event) => {
          setMapError(event.nativeEvent.description || 'No se pudo cargar el mapa.');
        }}
      />

      <Pressable
        accessibilityRole="button"
        onPress={handleSearch}
        disabled={!visibleBounds}
        style={({ pressed }) => [
          styles.searchButton,
          { top: insets.top + Spacing.two },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText type="smallBold" themeColor="primaryForeground">
          Buscar en esta Zona
        </ThemedText>
      </Pressable>

      <View style={[styles.filterMenu, { bottom: insets.bottom + Spacing.two }]}>
        <CrowdFilterMenu />
      </View>

      {selectedStore && (
        <View style={styles.popup}>
          <SupermarketCard
            store={selectedStore}
            onClose={() => setSelectedId(null)}
            onChat={() =>
              router.push({
                pathname: '/chat',
                params: {
                  storeId: selectedStore.id,
                  name: selectedStore.name,
                  chain: selectedStore.chain,
                  address: selectedStore.address,
                },
              })
            }
          />
        </View>
      )}

      {(isLocationLoading || (areStoresLoading && !storesError) || mapError || storesError) && (
        <View style={styles.statusBanner} pointerEvents="none">
          {(isLocationLoading || !mapLoaded || areStoresLoading) && (
            <ActivityIndicator size="small" color={theme.primary} />
          )}
          <ThemedText type="small" themeColor={mapError || storesError ? 'danger' : 'text'}>
            {mapError ??
              storesError ??
              (!mapLoaded
                ? 'Cargando el mapa…'
                : areStoresLoading
                  ? 'Buscando supermercados en esta zona…'
                  : 'Obteniendo tu ubicación…')}
          </ThemedText>
        </View>
      )}

      {!areStoresLoading && !storesError && searchBounds && stores.length === 0 && (
        <View style={styles.statusBanner} pointerEvents="none">
          <ThemedText type="small" themeColor="textSecondary">
            No encontramos supermercados en esta zona.
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  map: {
    flex: 1,
    backgroundColor: '#f0eee6',
  },
  statusBanner: {
    position: 'absolute',
    top: 96,
    left: Spacing.two,
    right: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#ffffffee',
    borderRadius: 12,
    padding: Spacing.two,
  },
  searchButton: {
    position: 'absolute',
    alignSelf: 'center',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 24,
    backgroundColor: '#208AEF',
    elevation: 6,
  },
  popup: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    bottom: Spacing.three,
    zIndex: 10,
  },
  filterMenu: {
    position: 'absolute',
    right: Spacing.two,
    zIndex: 20,
  },
  pressed: {
    opacity: 0.75,
  },
});
