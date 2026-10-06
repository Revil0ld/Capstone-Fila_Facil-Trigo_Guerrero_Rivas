import { router } from 'expo-router';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useMapSearchRegistration } from '@/components/app-tabs.web';
import { SupermarketCard } from '@/components/supermarket-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { MapBounds } from '@/data/supermarkets';
import { useCurrentLocation } from '@/hooks/use-location';
import { useNearbySupermarkets } from '@/hooks/use-nearby-supermarkets';
import { useTheme } from '@/hooks/use-theme';

type LeafletModule = typeof import('leaflet');

export default function MapWebScreen() {
  const theme = useTheme();
  const { coords, isLoading: isLocationLoading } = useCurrentLocation();
  const latitude = coords?.latitude ?? null;
  const longitude = coords?.longitude ?? null;
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const visibleBoundsRef = useRef<MapBounds | null>(null);
  const initialSearchStarted = useRef(false);
  const [searchBounds, setSearchBounds] = useState<MapBounds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const registerSearchAction = useMapSearchRegistration();
  const { stores, isLoading: areStoresLoading, error: storesError } =
    useNearbySupermarkets(searchBounds, coords);

  useEffect(() => {
    registerSearchAction(() => {
      const currentBounds = visibleBoundsRef.current;
      if (currentBounds) {
        setSelectedId(null);
        setSearchBounds({ ...currentBounds });
      }
    });

    return () => registerSearchAction(null);
  }, [registerSearchAction]);

  useEffect(() => {
    if (latitude === null || longitude === null || !mapElement.current) {
      return;
    }

    let disposed = false;
    let map: LeafletMap | null = null;

    void import('leaflet')
      .then((leaflet) => {
        if (disposed || !mapElement.current) {
          return;
        }

        leafletRef.current = leaflet;
        map = leaflet
          .map(mapElement.current, { zoomControl: false })
          .setView([latitude, longitude], 14);
        mapRef.current = map;

        const zoomControl = leaflet.control.zoom({ position: 'topleft' }).addTo(map);
        const zoomControlElement = zoomControl.getContainer();
        if (zoomControlElement) {
          zoomControlElement.style.marginTop = '156px';
        }

        leaflet
          .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          })
          .addTo(map);

        leaflet
          .marker([latitude, longitude], {
            title: 'Tu ubicación',
            icon: leaflet.divIcon({
              className: '',
              html: '<span style="display:flex;width:20px;height:20px;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;background:#208AEF;box-shadow:0 2px 8px #0006"><span style="width:6px;height:6px;border-radius:50%;background:white"></span></span>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
          })
          .addTo(map);

        const updateBounds = () => {
          if (!map) {
            return;
          }

          const visible = map.getBounds();
          const nextBounds = {
            south: visible.getSouth(),
            west: visible.getWest(),
            north: visible.getNorth(),
            east: visible.getEast(),
          };

          visibleBoundsRef.current = nextBounds;
          if (!initialSearchStarted.current) {
            initialSearchStarted.current = true;
            setSearchBounds(nextBounds);
          }
        };

        map.on('moveend', updateBounds);
        updateBounds();
      })
      .catch(() => {
        if (!disposed) {
          setMapError('No se pudo iniciar el mapa interactivo.');
        }
      });

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;

    if (!map || !leaflet) {
      return;
    }

    const markerLayer: LayerGroup = leaflet.layerGroup().addTo(map);

    stores.forEach((store) => {
      const isSelected = store.id === selectedId;
      const icon = leaflet.divIcon({
        className: '',
        html: `<span style="display:flex;width:36px;height:36px;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;background:${isSelected ? '#145DA0' : '#208AEF'};box-shadow:0 2px 8px #0006;font-size:19px">🛒</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      leaflet
        .marker([store.latitude, store.longitude], { icon })
        .addTo(markerLayer)
        .on('click', () => setSelectedId(store.id));
    });

    return () => {
      markerLayer.remove();
    };
  }, [stores, selectedId]);

  const selected = stores.find((store) => store.id === selectedId) ?? null;

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
    <ThemedView style={styles.container}>
      <View style={styles.mapWrapper}>
        <div ref={mapElement} style={styles.mapCanvas} />

        {(areStoresLoading || mapError) && (
          <View style={styles.statusBanner} pointerEvents="none">
            {areStoresLoading && <ActivityIndicator size="small" color={theme.primary} />}
            <ThemedText type="small" themeColor={mapError ? 'danger' : 'text'}>
              {mapError ?? 'Buscando supermercados en esta zona…'}
            </ThemedText>
          </View>
        )}

        {storesError && (
          <View style={styles.messageBanner} accessibilityRole="alert">
            <ThemedText type="small" themeColor="danger">
              {storesError}
            </ThemedText>
          </View>
        )}

        {!areStoresLoading && !storesError && searchBounds && stores.length === 0 && (
          <View style={styles.messageBanner} pointerEvents="none">
            <ThemedText type="small" themeColor="textSecondary">
              No encontramos supermercados en esta zona. Mueve o acerca el mapa para buscar de
              nuevo.
            </ThemedText>
          </View>
        )}

        {selected && (
          <View style={styles.popup}>
            <SupermarketCard
              store={selected}
              onClose={() => setSelectedId(null)}
              onChat={() =>
                router.push({
                  pathname: '/chat',
                  params: {
                    storeId: selected.id,
                    name: selected.name,
                    chain: selected.chain,
                    address: selected.address,
                  },
                })
              }
            />
          </View>
        )}
      </View>
    </ThemedView>
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
  mapWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  mapCanvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  statusBanner: {
    position: 'absolute',
    zIndex: 1000,
    top: 164,
    left: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#ffffffee',
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  messageBanner: {
    position: 'absolute',
    zIndex: 1000,
    top: 164,
    left: 64,
    right: Spacing.two,
    backgroundColor: '#ffffffee',
    borderRadius: 12,
    padding: Spacing.two,
  },
  popup: {
    position: 'absolute',
    zIndex: 1000,
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
  },
});
