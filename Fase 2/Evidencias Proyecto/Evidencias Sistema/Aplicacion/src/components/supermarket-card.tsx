import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  getSupermarketFilterVotes,
  synchronizeOsmSupermarket,
  submitSupermarketFilterVote,
  type SupermarketFilterVotes,
} from '@/data/supermarket-votes';
import type { NearbySupermarket } from '@/data/supermarkets';
import { useTheme } from '@/hooks/use-theme';
import { getSupermarketLogoUri } from '@/lib/supermarket-logos';
import { getSupermarketOccupancyColor } from '@/lib/supermarket-occupancy';

type SupermarketCardProps = {
  store: NearbySupermarket;
  onChat: () => void;
  onClose: () => void;
};

export function SupermarketCard({ store, onChat, onClose }: SupermarketCardProps) {
  return <SupermarketCardContent key={store.id} store={store} onChat={onChat} onClose={onClose} />;
}

function SupermarketCardContent({ store, onChat, onClose }: SupermarketCardProps) {
  const theme = useTheme();
  const logoUri = getSupermarketLogoUri(`${store.chain} ${store.name}`);
  const occupancyColor = getSupermarketOccupancyColor(store.occupancyPercent);
  const [filterVotes, setFilterVotes] = useState<SupermarketFilterVotes[]>([]);
  const [areVotesLoading, setAreVotesLoading] = useState(true);
  const [databaseSupermarketId, setDatabaseSupermarketId] = useState<string | null>(null);
  const [pendingFilterId, setPendingFilterId] = useState<string | null>(null);
  const [votesError, setVotesError] = useState<string | null>(null);
  const [votesWarning, setVotesWarning] = useState<string | null>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    let isActive = true;
    isMounted.current = true;

    void (store.databaseId
      ? Promise.resolve(store.databaseId)
      : synchronizeOsmSupermarket(store))
      .then(async (databaseId) => {
        if (!isActive) {
          return null;
        }
        setDatabaseSupermarketId(databaseId);
        return getSupermarketFilterVotes(databaseId);
      })
      .then((result) => {
        if (isActive && result) {
          const { votes, warning } = result;
          setFilterVotes(votes);
          setVotesWarning(warning);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setVotesError(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los votos de este supermercado.'
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setAreVotesLoading(false);
        }
      });

    return () => {
      isActive = false;
      isMounted.current = false;
    };
  }, [store]);

  async function handleVote(filterId: string, vote: -1 | 1) {
    if (!databaseSupermarketId) {
      setVotesError('El supermercado todavía no está sincronizado con la base de datos.');
      return;
    }

    setPendingFilterId(filterId);
    setVotesError(null);

    try {
      await submitSupermarketFilterVote(databaseSupermarketId, filterId, vote);
    } catch (error) {
      if (isMounted.current) {
        setVotesError(
          error instanceof Error ? error.message : 'No se pudo guardar tu voto.'
        );
        setPendingFilterId(null);
      }
      return;
    }

    if (!isMounted.current) {
      return;
    }

    try {
      const result = await getSupermarketFilterVotes(databaseSupermarketId);
      setFilterVotes(result.votes);
      setVotesWarning(result.warning);
    } catch (error) {
      setVotesError(
        `Tu voto se guardó, pero no se pudieron actualizar los totales: ${
          error instanceof Error ? error.message : 'error inesperado'
        }`
      );
    } finally {
      setPendingFilterId(null);
    }
  }

  return (
    <ThemedView type="background" style={styles.card}>
      <View style={styles.header}>
        <ThemedView style={[styles.badge, { backgroundColor: occupancyColor }]}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel={`Logo de ${store.chain}`}
            />
          ) : (
            <ThemedText type="smallBold" themeColor="primary">
              {store.chain.substring(0, 2).toUpperCase()}
            </ThemedText>
          )}
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

      <View style={styles.votesSection}>
        <ThemedText type="smallBold">¿Cómo está este supermercado?</ThemedText>
        {areVotesLoading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : filterVotes.length > 0 ? (
          filterVotes.map((filter) => {
            const totalVotes = filter.positiveVotes + filter.negativeVotes;
            const positivePercent =
              totalVotes === 0 ? 0 : Math.round((filter.positiveVotes / totalVotes) * 100);
            const negativePercent = totalVotes === 0 ? 0 : 100 - positivePercent;

            return (
              <View key={filter.id} style={styles.voteRow}>
                <View style={styles.filterInfo}>
                  <ThemedText type="default" style={styles.filterIcon}>
                    {getFilterIcon(filter.label)}
                  </ThemedText>
                  <View style={styles.filterLabelContainer}>
                    <ThemedText type="small" style={styles.filterLabel}>
                      {filter.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {getVoteExpirationHint(filter.label)}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.voteButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Votar positivo para ${filter.label}: ${positivePercent}% (${filter.positiveVotes} votos)`}
                    accessibilityState={{ selected: filter.myVote === 1, disabled: pendingFilterId !== null }}
                    disabled={pendingFilterId !== null}
                    onPress={() => void handleVote(filter.id, 1)}
                    style={({ pressed }) => [
                      styles.voteButton,
                      filter.myVote === 1 && styles.positiveSelected,
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small">👍</ThemedText>
                    <ThemedText type="small">{positivePercent}%</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Votar negativo para ${filter.label}: ${negativePercent}% (${filter.negativeVotes} votos)`}
                    accessibilityState={{ selected: filter.myVote === -1, disabled: pendingFilterId !== null }}
                    disabled={pendingFilterId !== null}
                    onPress={() => void handleVote(filter.id, -1)}
                    style={({ pressed }) => [
                      styles.voteButton,
                      filter.myVote === -1 && styles.negativeSelected,
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small">👎</ThemedText>
                    <ThemedText type="small">{negativePercent}%</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            No hay criterios de opinión configurados todavía.
          </ThemedText>
        )}
        {votesWarning && (
          <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
            {votesWarning}
          </ThemedText>
        )}
        {votesError && (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {votesError}
          </ThemedText>
        )}
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
    gap: Spacing.two,
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
    padding: Spacing.one,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  details: {
    flex: 1,
    gap: Spacing.half,
  },
  votesSection: {
    gap: Spacing.one,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  filterInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  filterLabelContainer: {
    flex: 1,
    minWidth: 0,
  },
  filterIcon: {
    width: 28,
    textAlign: 'center',
  },
  filterLabel: {
    flex: 1,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  voteButton: {
    minHeight: 40,
    minWidth: 48,
    paddingHorizontal: Spacing.one,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
    backgroundColor: '#80808022',
  },
  positiveSelected: {
    backgroundColor: '#22C55E44',
  },
  negativeSelected: {
    backgroundColor: '#EF444444',
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

function getFilterIcon(label: string) {
  const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (normalizedLabel.includes('carro') || normalizedLabel.includes('carrito')) {
    return '🛒';
  }
  if (normalizedLabel.includes('estacionamiento')) {
    return '🅿️';
  }
  if (normalizedLabel.includes('oferta') || normalizedLabel.includes('precio')) {
    return '🏷️';
  }

  return '📊';
}

function getVoteExpirationHint(label: string) {
  const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (
    normalizedLabel.includes('carro') ||
    normalizedLabel.includes('carrito') ||
    normalizedLabel.includes('estacionamiento')
  ) {
    return 'Votos válidos por 1 hora';
  }
  if (normalizedLabel.includes('oferta')) {
    return 'Votos válidos por 1 semana';
  }
  return '';
}
