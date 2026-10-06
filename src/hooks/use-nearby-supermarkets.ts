import { useEffect, useState } from 'react';

import {
  getNearbySupermarkets,
  type MapBounds,
  type NearbySupermarket,
} from '@/data/supermarkets';
import type { Coords } from '@/lib/geo';

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
    const timeout = setTimeout(() => {
      setState((current) => ({ ...current, isLoading: true, error: null }));

      void getNearbySupermarkets(bounds, origin, controller.signal)
        .then((stores) => {
          if (controller.signal.aborted) {
            return;
          }

          setState({ stores, isLoading: false, error: null });
        })
        .catch((error: unknown) => {
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
    }, 500);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [bounds, origin]);

  return state;
}
