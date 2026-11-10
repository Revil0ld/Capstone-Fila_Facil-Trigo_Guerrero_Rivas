import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * `useSyncExternalStore` returns the server snapshot during SSR and the client snapshot after
 * hydration, which avoids setting state inside an effect.
 */
const emptySubscribe = () => () => {};

export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const hasHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}