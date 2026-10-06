import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function SupermarketChatScreen() {
  const { storeId, name, chain, address } = useLocalSearchParams<{
    storeId?: string;
    name?: string;
    chain?: string;
    address?: string;
  }>();
  const supermarketName = name || chain || 'Supermercado';

  return (
    <ThemedView style={styles.container} testID={`supermarket-chat-${storeId ?? 'unknown'}`}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al mapa"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ThemedText type="subtitle" style={styles.backArrow}>
            ‹
          </ThemedText>
        </Pressable>

        <View style={styles.headerText}>
          <ThemedText type="smallBold">{supermarketName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {chain || 'Grupo del supermercado'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.emptyState}>
        <ThemedView type="backgroundElement" style={styles.chatIcon}>
          <ThemedText style={styles.chatEmoji}>💬</ThemedText>
        </ThemedView>
        <ThemedText type="subtitle" style={styles.emptyTitle}>
          Chat del supermercado
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.emptyDescription}>
          Este será el grupo para conversar con otras personas en {supermarketName}.
        </ThemedText>
        {address ? (
          <ThemedText type="small" themeColor="textSecondary">
            {address}
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#88888855',
  },
  backButton: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 38,
    lineHeight: 42,
  },
  headerText: {
    gap: Spacing.half,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.two,
  },
  chatIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  chatEmoji: {
    fontSize: 34,
  },
  emptyTitle: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  emptyDescription: {
    textAlign: 'center',
    maxWidth: 420,
  },
});
