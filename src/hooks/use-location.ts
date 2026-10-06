import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { Coords } from '@/lib/geo';

type LocationState = {
  coords: Coords | null;
  error: string | null;
  isLoading: boolean;
};

/** Fallback usado cuando el usuario deniega el permiso o falla la lectura de GPS. */
export const FALLBACK_COORDS: Coords = { latitude: -33.4489, longitude: -70.6693 };

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({
    coords: null,
    error: null,
    isLoading: true,
  });

  const request = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setState({
          coords: FALLBACK_COORDS,
          error: 'Permiso de ubicación denegado. Mostrando una zona por defecto.',
          isLoading: false,
        });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setState({
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        error: null,
        isLoading: false,
      });
    } catch {
      setState({
        coords: FALLBACK_COORDS,
        error: 'No se pudo obtener tu ubicación. Mostrando una zona por defecto.',
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    // Pedir la ubicación al montar la pantalla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void request();
  }, [request]);

  return { ...state, refresh: request };
}