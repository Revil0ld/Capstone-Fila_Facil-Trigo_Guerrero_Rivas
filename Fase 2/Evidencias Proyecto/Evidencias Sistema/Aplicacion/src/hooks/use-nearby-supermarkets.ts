import { useEffect, useState } from 'react';

import {
  getNearbySupermarkets,
  getSupermarketOccupancies,
  type MapBounds,
  type NearbySupermarket,
} from '@/data/supermarkets';
import type { Coords } from '@/lib/geo';

const maxOccupancyStores = 150;

type NearbySupermarketsState = {
  stores: NearbySupermarket[];
  isLoading: boolean;
  error: string | null;
};

export function useNearbySupermarkets(bounds: MapBounds | null, origin: Coords | null) {
  const [state, setState] = useState<NearbySupermarketsState>({
    stores: [],
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!bounds || !origin) {
      return;
    }

    const controller = new AbortController();
    const loadingTimeout = setTimeout(() => {
      if (!controller.signal.aborted) {
        setState((current) => ({ ...current, isLoading: true, error: null }));
      }
    }, 0);

    void getNearbySupermarkets(bounds, origin, controller.signal)
      .then((stores) => {
        clearTimeout(loadingTimeout);
        if (controller.signal.aborted) {
          return;
        }

        setState({
          stores,
          isLoading: false,
          error: null,
        });

        // El color se completa después para no retrasar la aparición de los locales.
        void getSupermarketOccupancies(
          stores.slice(0, maxOccupancyStores).map((store) => store.id),
          controller.signal
        )
          .then((occupancies) => {
            if (controller.signal.aborted) {
              return;
            }
            setState((current) => ({
              ...current,
              stores: current.stores.map((store) => ({
                ...store,
                occupancyPercent: occupancies.get(store.id) ?? store.occupancyPercent,
              })),
            }));
          })
          .catch(() => undefined);
      })
      .catch((error: unknown) => {
        clearTimeout(loadingTimeout);
        if (controller.signal.aborted) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los supermercados.',
        }));
      });

    return () => {
      clearTimeout(loadingTimeout);
      controller.abort();
    };
  }, [bounds, origin]);

  return state;
}
