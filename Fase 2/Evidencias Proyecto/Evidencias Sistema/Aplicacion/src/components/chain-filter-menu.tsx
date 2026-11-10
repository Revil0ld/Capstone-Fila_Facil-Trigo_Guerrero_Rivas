import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeSupermarketChain } from '@/lib/supermarket-chain';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type ChainFilterMenuProps = {
  chains: string[];
  selectedChain: string | null;
  onSelectChain: (chain: string | null) => void;
};

export function ChainFilterMenu({
  chains,
  selectedChain,
  onSelectChain,
}: ChainFilterMenuProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredChains = useMemo(() => {
    const normalizedQuery = normalizeSupermarketChain(query);
    return chains.filter((chain) =>
      normalizeSupermarketChain(chain).includes(normalizedQuery)
    );
  }, [chains, query]);

  function selectChain(chain: string | null) {
    onSelectChain(chain);
    setIsOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.anchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar por cadena de supermercado"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((open) => !open)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText type="smallBold" numberOfLines={1}>
          {selectedChain ?? 'Cadena'}
        </ThemedText>
        <ThemedText type="smallBold">{isOpen ? '−' : '+'}</ThemedText>
      </Pressable>

      {isOpen ? (
        <ThemedView
          type="background"
          style={[styles.menu, Platform.OS === 'web' ? styles.menuDown : styles.menuUp]}
        >
          <ThemedText type="default" style={styles.heading}>
            Buscar cadena
          </ThemedText>
          <TextInput
            accessibilityLabel="Buscar una cadena de supermercado"
            value={query}
            onChangeText={setQuery}
            placeholder="Escribe una cadena"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={[
              styles.searchInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          />
          <ScrollView
            style={styles.options}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <ChainOption
              label="Todas"
              selected={selectedChain === null}
              onPress={() => selectChain(null)}
            />
            {filteredChains.map((chain) => (
              <ChainOption
                key={normalizeSupermarketChain(chain)}
                label={chain}
                selected={
                  selectedChain !== null &&
                  normalizeSupermarketChain(selectedChain) === normalizeSupermarketChain(chain)
                }
                onPress={() => selectChain(chain)}
              />
            ))}
            {filteredChains.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No se encontraron cadenas.
              </ThemedText>
            ) : null}
          </ScrollView>
        </ThemedView>
      ) : null}
    </View>
  );
}

function ChainOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <ThemedText type="small" numberOfLines={1} style={styles.optionLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={selected ? 'primary' : 'textSecondary'}>
        {selected ? '✓' : ''}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    flexShrink: 0,
    zIndex: 40,
  },
  button: {
    maxWidth: 172,
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
    zIndex: 50,
    right: 0,
    width: 280,
    gap: Spacing.two,
    padding: Spacing.three,
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
  searchInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  options: {
    maxHeight: 240,
  },
  option: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  optionLabel: {
    flex: 1,
  },
  empty: {
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.75,
  },
});
