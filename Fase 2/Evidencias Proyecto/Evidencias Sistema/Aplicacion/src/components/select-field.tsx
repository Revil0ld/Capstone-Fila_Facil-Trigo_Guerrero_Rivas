import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SelectFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function SelectField({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
  error,
}: SelectFieldProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return normalizedQuery
      ? options.filter((option) => normalize(option).includes(normalizedQuery))
      : options;
  }, [options, query]);

  function close() {
    setIsOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setIsOpen(true)}>
        <ThemedView
          type="backgroundElement"
          style={[
            styles.selector,
            { borderColor: error ? theme.danger : theme.backgroundSelected },
            disabled && styles.disabled,
          ]}>
          <ThemedText
            style={[styles.selectorText, !value && { color: theme.textSecondary }]}
            numberOfLines={1}>
            {value || placeholder}
          </ThemedText>
          <ThemedText themeColor="textSecondary">▾</ThemedText>
        </ThemedView>
      </Pressable>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      <Modal visible={isOpen} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {label}
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={Spacing.two}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Cerrar
              </ThemedText>
            </Pressable>
          </View>

          {options.length > 12 ? (
            <ThemedView type="backgroundElement" style={styles.search}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar…"
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </ThemedView>
          ) : null}

          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No hay resultados.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item === value }}
                onPress={() => {
                  onChange(item);
                  close();
                }}
                style={({ pressed }) => [
                  styles.option,
                  { borderBottomColor: theme.backgroundSelected },
                  (pressed || item === value) && { backgroundColor: theme.backgroundSelected },
                ]}>
                <ThemedText style={item === value ? { color: theme.primary } : undefined}>
                  {item}
                </ThemedText>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  selectorText: {
    flex: 1,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  modalTitle: {
    flex: 1,
  },
  search: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  searchInput: {
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  option: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    padding: Spacing.four,
    textAlign: 'center',
  },
});
