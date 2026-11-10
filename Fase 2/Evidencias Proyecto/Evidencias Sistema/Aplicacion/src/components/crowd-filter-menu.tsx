import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  OCCUPANCY_FILTER_LEVELS,
  type OccupancyFilterLevel,
} from '@/lib/supermarket-occupancy';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type CrowdFilterMenuProps = {
  selectedLevels: OccupancyFilterLevel[];
  onToggleLevel: (level: OccupancyFilterLevel) => void;
  onReset: () => void;
};

export function CrowdFilterMenu({
  selectedLevels,
  onToggleLevel,
  onReset,
}: CrowdFilterMenuProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const isFiltering = selectedLevels.length < OCCUPANCY_FILTER_LEVELS.length;

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
        <ThemedText type="smallBold">Filtros{isFiltering ? ` (${selectedLevels.length})` : ''}</ThemedText>
        <ThemedText type="smallBold">{isOpen ? '−' : '+'}</ThemedText>
      </Pressable>

      {isOpen && (
        <ThemedView
          type="background"
          style={[styles.menu, Platform.OS === 'web' ? styles.menuDown : styles.menuUp]}>
          <ThemedText type="default" style={styles.heading}>
            Nivel de aforo
          </ThemedText>
          {OCCUPANCY_FILTER_LEVELS.map(({ id, color, label }) => {
            const isSelected = selectedLevels.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: isSelected }}
                onPress={() => onToggleLevel(id)}
                style={({ pressed }) => [styles.level, pressed && styles.pressed]}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <ThemedText type="default" numberOfLines={1} style={styles.levelLabel}>
                  {label}
                </ThemedText>
                <ThemedText type="smallBold" themeColor={isSelected ? 'primary' : 'textSecondary'}>
                  {isSelected ? '✓' : ''}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mostrar todos los niveles de aforo"
            onPress={onReset}
            style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="primary">
              Mostrar todos
            </ThemedText>
          </Pressable>
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
    minHeight: 36,
  },
  levelLabel: {
    flex: 1,
  },
  resetButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
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
