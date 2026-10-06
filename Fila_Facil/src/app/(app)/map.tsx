import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function MapFallbackScreen() {
  return (
    <ThemedView style={styles.centered}>
      <ThemedText type="small" themeColor="textSecondary">
        El mapa no está disponible en esta plataforma.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
});
