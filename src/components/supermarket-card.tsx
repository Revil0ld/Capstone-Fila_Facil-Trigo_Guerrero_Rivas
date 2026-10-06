import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { NearbySupermarket } from '@/data/supermarkets';
import { useTheme } from '@/hooks/use-theme';

type SupermarketCardProps = {
  store: NearbySupermarket;
  onChat: () => void;
  onClose: () => void;
};

export function SupermarketCard({ store, onChat, onClose }: SupermarketCardProps) {
  const theme = useTheme();

  return (
    <ThemedView type="background" style={styles.card}>
      <View style={styles.header}>
        <ThemedView type="backgroundElement" style={styles.badge}>
          <ThemedText type="smallBold" themeColor="primary">
            {store.chain.substring(0, 2).toUpperCase()}
          </ThemedText>
        </ThemedView>

        <View style={styles.details}>
          <ThemedText type="smallBold">{store.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {store.chain} · {store.distanceKm.toFixed(1)} km
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {store.address}
          </ThemedText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar detalles del supermercado"
          onPress={onClose}
          hitSlop={8}
          style={styles.closeButton}
        >
          <ThemedText type="smallBold" themeColor="textSecondary">
            ×
          </ThemedText>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Entrar al chat de ${store.name}`}
        onPress={onChat}
        style={({ pressed }) => [
          styles.chatButton,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText type="smallBold" themeColor="primaryForeground">
          💬  Entrar al chat del supermercado
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    gap: Spacing.half,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButton: {
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
