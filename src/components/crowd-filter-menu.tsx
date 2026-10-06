import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const crowdLevels = [
  { color: '#22C55E', label: 'Poco lleno' },
  { color: '#EAB308', label: 'Medianamente lleno' },
  { color: '#EF4444', label: 'Muy lleno' },
];

export function CrowdFilterMenu() {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.anchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mostrar niveles de aforo"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((open) => !open)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold">Filtros</ThemedText>
        <ThemedText type="smallBold">{isOpen ? '−' : '+'}</ThemedText>
      </Pressable>

      {isOpen && (
        <ThemedView
          type="background"
          style={[styles.menu, Platform.OS === 'web' ? styles.menuDown : styles.menuUp]}>
          <ThemedText type="default" style={styles.heading}>
            Nivel de aforo
          </ThemedText>
          {crowdLevels.map(({ color, label }) => (
            <View key={label} style={styles.level}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <ThemedText type="default" numberOfLines={1}>
                {label}
              </ThemedText>
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            Todavía no hay datos de aforo disponibles.
          </ThemedText>
        </ThemedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    flexShrink: 0,
    zIndex: 30,
  },
  button: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
  },
  menu: {
    position: 'absolute',
    zIndex: 40,
    right: 0,
    width: 320,
    flexShrink: 0,
    gap: Spacing.three,
    padding: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8A8A8A',
    borderRadius: 16,
    elevation: 8,
    boxShadow: '0 3px 12px #0005',
  },
  menuDown: {
    top: 48,
  },
  menuUp: {
    bottom: 48,
  },
  heading: {
    fontWeight: '700',
  },
  level: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pressed: {
    opacity: 0.75,
  },
});
