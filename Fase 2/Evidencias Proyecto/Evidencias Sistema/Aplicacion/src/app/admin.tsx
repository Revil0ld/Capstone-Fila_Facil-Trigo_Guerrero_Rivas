import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminUsersPanel } from '@/components/admin-users-panel';
import { getSupermarketBrand, getSupermarketChains } from '@/lib/supermarket-chain';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  banAdminUserTemporarily,
  deleteAllAdminReportedUserMessages,
  deleteAdminChatMessage,
  getAdminChatReports,
  getAdminSupermarkets,
  getAdminReportedUserMessages,
  getAdminUsers,
  getAdminChatMessages,
  getAdminOverview,
  permanentlyDeleteAdminSupermarket,
  setAdminSupermarketVisibility,
  updateAdminUserSanctions,
  type AdminChatMessage,
  type AdminChatReport,
  type AdminOverview,
  type AdminReportedMessage,
  type AdminSupermarket,
  type AdminUser,
} from '@/data/admin';
import { useTheme } from '@/hooks/use-theme';

export default function AdminScreen() {
  const theme = useTheme();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [supermarkets, setSupermarkets] = useState<AdminSupermarket[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminChatReport[]>([]);
  const [reportedMessages, setReportedMessages] = useState<
    Record<string, AdminReportedMessage[]>
  >({});
  const [expandedReportUserId, setExpandedReportUserId] = useState<string | null>(null);
  const [loadingReportedUserId, setLoadingReportedUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'users'>('dashboard');
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const reportGroups = groupAdminReports(reports);

  const fetchAdminData = useCallback(
    () =>
      Promise.all([
        getAdminOverview(),
        getAdminChatMessages(),
        getAdminSupermarkets(),
        getAdminUsers(),
        getAdminChatReports(),
      ]),
    []
  );

  useEffect(() => {
    let isActive = true;
    void fetchAdminData()
      .then(([nextOverview, nextMessages, nextSupermarkets, nextUsers, nextReports]) => {
        if (isActive) {
          setOverview(nextOverview);
          setMessages(nextMessages);
          setSupermarkets(nextSupermarkets);
          setUsers(nextUsers);
          setReports(nextReports);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        console.error('No se pudo cargar el panel de administración.', loadError);
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No se pudo cargar el panel de administración.'
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [fetchAdminData]);

  useEffect(() => {
    let isActive = true;
    const interval = setInterval(() => {
      void getAdminChatReports()
        .then((nextReports) => {
          if (isActive) {
            setReports(nextReports);
          }
        })
        .catch((reportsError: unknown) => {
          console.error('No se pudieron actualizar las alertas de reportes.', reportsError);
          if (isActive) {
            setError(
              reportsError instanceof Error
                ? reportsError.message
                : 'No se pudieron actualizar las alertas de reportes.'
            );
          }
        });
    }, 30_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      const [nextOverview, nextMessages, nextSupermarkets, nextUsers, nextReports] =
        await fetchAdminData();
      setOverview(nextOverview);
      setMessages(nextMessages);
      setSupermarkets(nextSupermarkets);
      setUsers(nextUsers);
      setReports(nextReports);
    } catch (refreshError) {
      console.error('No se pudo actualizar el panel de administración.', refreshError);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'No se pudo cargar el panel de administración.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleDeleteMessage(messageId: number) {
    const action = `chat-delete:${messageId}`;
    if (pendingAction !== action) {
      setPendingAction(action);
      setNotice(null);
      return;
    }

    setBusyAction(action);
    setDeletingId(messageId);
    setPendingAction(null);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminChatMessage(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setOverview((current) =>
        current
          ? { ...current, chatMessages: Math.max(0, current.chatMessages - 1) }
          : current
      );
      setNotice('Mensaje eliminado.');
    } catch (deleteError) {
      console.error('No se pudo eliminar el mensaje moderado.', deleteError);
      setError(
        deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el mensaje.'
      );
    } finally {
      setDeletingId(null);
      setBusyAction(null);
    }
  }

  async function handleCatalogVisibility(store: AdminSupermarket) {
    const action = `catalog-visibility:${store.id}`;
    if (busyAction) return;
    setBusyAction(action);
    setPendingAction(null);
    setError(null);
    setNotice(null);
    try {
      await setAdminSupermarketVisibility(store.id, !store.isActive);
      setSupermarkets((current) =>
        current.map((item) =>
          item.id === store.id ? { ...item, isActive: !store.isActive } : item
        )
      );
      setOverview((current) =>
        current
          ? {
              ...current,
              totalSupermarkets: Math.max(
                0,
                current.totalSupermarkets + (store.isActive ? -1 : 1)
              ),
            }
          : current
      );
      setNotice(
        store.isActive
          ? 'Supermercado oculto. Puedes restaurarlo desde el catálogo.'
          : 'Supermercado restaurado en el catálogo.'
      );
    } catch (visibilityError) {
      console.error('No se pudo cambiar la visibilidad del supermercado.', visibilityError);
      setError(
        visibilityError instanceof Error
          ? visibilityError.message
          : 'No se pudo actualizar el catálogo.'
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePermanentlyDeleteStore(store: AdminSupermarket) {
    const action = `catalog-delete:${store.id}`;
    if (pendingAction !== action) {
      setPendingAction(action);
      setNotice(null);
      return;
    }
    if (busyAction) return;

    setBusyAction(action);
    setPendingAction(null);
    setError(null);
    setNotice(null);
    try {
      await permanentlyDeleteAdminSupermarket(store.id);
      setSupermarkets((current) => current.filter((item) => item.id !== store.id));
      if (store.isActive) {
        setOverview((current) =>
          current
            ? { ...current, totalSupermarkets: Math.max(0, current.totalSupermarkets - 1) }
            : current
        );
      }
      setNotice('Supermercado y sus datos asociados eliminados definitivamente.');
    } catch (deleteError) {
      console.error('No se pudo eliminar definitivamente el supermercado.', deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No se pudo eliminar definitivamente el supermercado.'
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUserSanction(user: AdminUser, sanction: 'account' | 'chat') {
    const action = `user-${sanction}:${user.id}`;
    if (user.role === 'admin' || busyAction) return;
    if (pendingAction !== action) {
      setPendingAction(action);
      setNotice(null);
      return;
    }

    const nextBanned = sanction === 'account' ? !user.isBanned : user.isBanned;
    const nextChatBanned = sanction === 'chat' ? !user.isChatBanned : user.isChatBanned;
    setBusyAction(action);
    setPendingAction(null);
    setError(null);
    setNotice(null);
    try {
      await updateAdminUserSanctions(user.id, nextBanned, nextChatBanned);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? { ...item, isBanned: nextBanned, isChatBanned: nextChatBanned }
            : item
        )
      );
      setNotice(
        sanction === 'account'
          ? nextBanned
            ? `Cuenta de ${user.email} suspendida.`
            : `Cuenta de ${user.email} reactivada.`
          : nextChatBanned
            ? `Envío de mensajes restringido para ${user.email}.`
            : `Permiso de chat restaurado para ${user.email}.`
      );
    } catch (sanctionError) {
      console.error('No se pudo actualizar la sanción de la cuenta.', sanctionError);
      setError(
        sanctionError instanceof Error
          ? sanctionError.message
          : 'No se pudo actualizar la cuenta.'
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTemporaryBan(user: AdminUser, hours: number, label: string) {
    const action = `user-temp:${user.id}:${hours}`;
    if (user.role === 'admin' || busyAction) return;
    if (pendingAction !== action) {
      setPendingAction(action);
      setNotice(null);
      return;
    }

    setBusyAction(action);
    setPendingAction(null);
    setError(null);
    setNotice(null);
    try {
      await banAdminUserTemporarily(user.id, hours);
      const bannedUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, isBanned: true, bannedUntil } : item
        )
      );
      setNotice(`Cuenta de ${user.email} suspendida por ${label}.`);
    } catch (banError) {
      console.error('No se pudo aplicar el baneo temporal.', banError);
      setError(
        banError instanceof Error ? banError.message : 'No se pudo aplicar el baneo temporal.'
      );
    } finally {
      setBusyAction(null);
    }
  }

  function openUsersView(userId: string | null) {
    setFocusedUserId(userId);
    setPendingAction(null);
    setNotice(null);
    setView('users');
  }

  function handleOpenReportChat(user: AdminUser) {
    if (!user.reportSupermarketId) return;
    router.push({
      pathname: '/chat',
      params: { storeId: user.reportSupermarketId, name: user.reportSupermarketName ?? '' },
    });
  }

  async function handleToggleReportedMessages(userId: string) {
    if (expandedReportUserId === userId) {
      setExpandedReportUserId(null);
      return;
    }
    setExpandedReportUserId(userId);
    if (reportedMessages[userId]) return;

    setLoadingReportedUserId(userId);
    setError(null);
    try {
      const nextMessages = await getAdminReportedUserMessages(userId);
      setReportedMessages((current) => ({ ...current, [userId]: nextMessages }));
    } catch (loadError) {
      console.error('No se pudieron cargar los mensajes de la persona reportada.', loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar los mensajes de la persona reportada.'
      );
      setExpandedReportUserId(null);
    } finally {
      setLoadingReportedUserId(null);
    }
  }

  async function handleDeleteAllReportedMessages(userId: string) {
    const action = `reported-user-delete:${userId}`;
    if (pendingAction !== action) {
      setPendingAction(action);
      setNotice(null);
      return;
    }
    if (busyAction) return;

    setBusyAction(action);
    setPendingAction(null);
    setError(null);
    setNotice(null);
    try {
      const deletedCount = await deleteAllAdminReportedUserMessages(userId);
      setReports((current) => current.filter((report) => report.reportedUserId !== userId));
      setReportedMessages((current) => ({
        ...current,
        [userId]: [],
      }));
      setOverview((current) =>
        current
          ? { ...current, chatMessages: Math.max(0, current.chatMessages - deletedCount) }
          : current
      );
      setExpandedReportUserId(null);
      setNotice(`Se eliminaron ${deletedCount} comentarios y los reportes quedaron revisados.`);
      const refreshedMessages = await getAdminChatMessages();
      setMessages(refreshedMessages);
    } catch (deleteError) {
      console.error('No se pudieron eliminar los mensajes de la persona reportada.', deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No se pudieron eliminar los mensajes de la persona reportada.'
      );
    } finally {
      setBusyAction(null);
    }
  }

  const relevantSupermarkets = supermarkets.filter(
    (store) => getSupermarketBrand(store.chain, store.name) !== null
  );
  const chainOptions = getSupermarketChains(relevantSupermarkets);
  const filteredSupermarkets = chainFilter
    ? relevantSupermarkets.filter(
        (store) => getSupermarketBrand(store.chain, store.name) === chainFilter
      )
    : relevantSupermarkets;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => {
            if (view === 'users') {
              setView('dashboard');
              setFocusedUserId(null);
              setPendingAction(null);
            } else {
              router.back();
            }
          }}
          style={styles.backButton}
        >
          <ThemedText type="subtitle">‹</ThemedText>
        </Pressable>
        <View style={styles.headerText}>
          <ThemedText type="subtitle">Administración</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Métricas y moderación de chats
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isRefreshing}
          onPress={() => void handleRefresh()}
          style={styles.refreshButton}
        >
          {isRefreshing ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <ThemedText type="smallBold" themeColor="primary">
              Actualizar
            </ThemedText>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary">
            Cargando panel…
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <ThemedView type="backgroundElement" style={styles.errorCard} accessibilityRole="alert">
              <ThemedText type="small" themeColor="danger">{error}</ThemedText>
            </ThemedView>
          ) : null}
          {notice ? (
            <ThemedText type="small" style={{ color: theme.primary }}>
              {notice}
            </ThemedText>
          ) : null}

          {view === 'users' ? (
            <AdminUsersPanel
              users={users}
              focusedUserId={focusedUserId}
              busyAction={busyAction}
              pendingAction={pendingAction}
              onClearFocus={() => setFocusedUserId(null)}
              onSanction={(user, sanction) => void handleUserSanction(user, sanction)}
              onTemporaryBan={(user, hours, label) => void handleTemporaryBan(user, hours, label)}
              onOpenChat={handleOpenReportChat}
            />
          ) : (
          <>
          {overview ? (
            <View style={styles.metricsGrid}>
              <MetricCard
                label="Usuarios"
                value={overview.totalUsers}
                onPress={() => openUsersView(null)}
              />
              <MetricCard label="Supermercados" value={overview.totalSupermarkets} />
              <MetricCard label="Mensajes activos" value={overview.chatMessages} />
            </View>
          ) : null}

          <View style={styles.sectionTitle}>
            <View style={styles.entityHeading}>
              <ThemedText type="subtitle">Alertas por reportes</ThemedText>
              {reportGroups.length > 0 ? (
                <StatusTag label={`${reportGroups.length} pendiente(s)`} />
              ) : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Se alerta cuando 5 personas distintas reportan mensajes de una cuenta.
              Las alertas se actualizan cada 30 segundos.
            </ThemedText>
          </View>
          {reportGroups.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No hay alertas pendientes de revisión.
              </ThemedText>
            </ThemedView>
          ) : (
            reportGroups.map((group) => {
              const isExpanded = expandedReportUserId === group.userId;
              const isLoadingMessages = loadingReportedUserId === group.userId;
              const deleteAction = `reported-user-delete:${group.userId}`;
              const isDeleting = busyAction === deleteAction;

              return (
                <ThemedView key={group.userId} type="backgroundElement" style={styles.entityCard}>
                  <View style={styles.messageInfo}>
                    <View style={styles.entityHeading}>
                      <ThemedText type="smallBold" style={styles.entityName}>
                        {group.userName}
                      </ThemedText>
                      <StatusTag label={`${group.reporterCount} reportantes`} />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {group.email}
                    </ThemedText>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openUsersView(group.userId)}
                    style={[styles.actionButton, { borderColor: theme.primary }]}
                  >
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      Administrar cuenta y ver chat
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={loadingReportedUserId !== null}
                    onPress={() => void handleToggleReportedMessages(group.userId)}
                    style={[styles.actionButton, { borderColor: theme.backgroundSelected }]}
                  >
                    {isLoadingMessages ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : (
                      <ThemedText type="smallBold">
                        {isExpanded ? 'Ocultar conversación' : 'Ver conversación reportada'}
                      </ThemedText>
                    )}
                  </Pressable>

                  {isExpanded ? (
                    <View style={styles.reportEvidenceList}>
                      {group.reports.map((report) => (
                        <View key={report.id} style={styles.reportEvidence}>
                          <ThemedText type="smallBold">
                            {report.reporterName} reportó en {report.supermarketName}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {formatDate(report.createdAt)}
                          </ThemedText>
                          <ThemedText>{report.message}</ThemedText>
                        </View>
                      ))}
                      {reportedMessages[group.userId] ? (
                        <View style={styles.reportedHistory}>
                          <ThemedText type="smallBold">
                            Mensajes recientes de esta persona ({reportedMessages[group.userId].length})
                          </ThemedText>
                          {reportedMessages[group.userId].map((message) => (
                            <View key={message.id} style={styles.reportEvidence}>
                              <ThemedText type="smallBold">{message.supermarketName}</ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {formatDate(message.createdAt)}
                              </ThemedText>
                              <ThemedText>{message.message}</ThemedText>
                            </View>
                          ))}
                          {reportedMessages[group.userId].length === 200 ? (
                            <ThemedText type="small" themeColor="textSecondary">
                              Se muestran los 200 mensajes más recientes. La acción de eliminación
                              borra todos los mensajes de la cuenta.
                            </ThemedText>
                          ) : null}
                        </View>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyAction !== null}
                        onPress={() => void handleDeleteAllReportedMessages(group.userId)}
                        style={[
                          styles.actionButton,
                          {
                            borderColor:
                              pendingAction === deleteAction ? theme.danger : theme.backgroundSelected,
                          },
                          busyAction !== null && styles.disabled,
                        ]}
                      >
                        {isDeleting ? (
                          <ActivityIndicator color={theme.danger} />
                        ) : (
                          <ThemedText
                            type="smallBold"
                            style={{
                              color: pendingAction === deleteAction ? theme.danger : theme.text,
                            }}
                          >
                            {pendingAction === deleteAction
                              ? 'Confirmar eliminación de todos los comentarios'
                              : 'Eliminar todos los comentarios de esta persona'}
                          </ThemedText>
                        )}
                      </Pressable>
                    </View>
                  ) : null}
                </ThemedView>
              );
            })
          )}

          <View style={styles.sectionTitle}>
            <ThemedText type="subtitle">Catálogo de supermercados</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Oculta primero; elimina definitivamente solo cuando estés seguro.
            </ThemedText>
          </View>
          {chainOptions.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsRow}>
              {[null, ...chainOptions].map((chain) => {
                const selected = chainFilter === chain;
                return (
                  <Pressable
                    key={chain ?? 'all'}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setChainFilter(chain)}
                    style={[
                      styles.actionButton,
                      { borderColor: selected ? theme.primary : theme.backgroundSelected },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: selected ? theme.primary : theme.text }}
                    >
                      {chain ?? 'Todos'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {filteredSupermarkets.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No hay supermercados en el catálogo.
              </ThemedText>
            </ThemedView>
          ) : (
            filteredSupermarkets.map((store) => {
              const deleteAction = `catalog-delete:${store.id}`;
              const isDeleting = busyAction === deleteAction;
              return (
                <ThemedView key={store.id} type="backgroundElement" style={styles.entityCard}>
                  <View style={styles.messageInfo}>
                    <View style={styles.entityHeading}>
                      <ThemedText type="smallBold" numberOfLines={1} style={styles.entityName}>
                        {store.name}
                      </ThemedText>
                      <StatusTag
                        label={store.isActive ? 'Visible' : 'Oculto'}
                        positive={store.isActive}
                      />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[store.chain, store.address].filter(Boolean).join(' · ') || 'Sin dirección'}
                    </ThemedText>
                  </View>
                  <View style={styles.actionsRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busyAction !== null}
                      onPress={() => void handleCatalogVisibility(store)}
                      style={[
                        styles.actionButton,
                        { borderColor: theme.backgroundSelected },
                        busyAction !== null && styles.disabled,
                      ]}
                    >
                      <ThemedText type="smallBold">
                        {store.isActive ? 'Ocultar' : 'Restaurar'}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busyAction !== null}
                      onPress={() => void handlePermanentlyDeleteStore(store)}
                      style={[
                        styles.actionButton,
                        {
                          borderColor:
                            pendingAction === deleteAction ? theme.danger : theme.backgroundSelected,
                        },
                        busyAction !== null && styles.disabled,
                      ]}
                    >
                      {isDeleting ? (
                        <ActivityIndicator color={theme.danger} />
                      ) : (
                        <ThemedText
                          type="smallBold"
                          style={{
                            color: pendingAction === deleteAction ? theme.danger : theme.text,
                          }}
                        >
                          {pendingAction === deleteAction
                            ? 'Confirmar borrado'
                            : 'Eliminar definitivamente'}
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                </ThemedView>
              );
            })
          )}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <ThemedText type="subtitle">Moderación del chat</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Últimos {messages.length} mensajes de todos los supermercados
              </ThemedText>
            </View>
          </View>

          {messages.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No hay mensajes para revisar.
              </ThemedText>
            </ThemedView>
          ) : (
            messages.map((message) => (
              <ThemedView key={message.id} type="backgroundElement" style={styles.messageCard}>
                <View style={styles.messageInfo}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {message.supermarketName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {message.author} · {formatDate(message.createdAt)}
                  </ThemedText>
                </View>
                <ThemedText>{message.text}</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  disabled={deletingId !== null}
                  onPress={() => void handleDeleteMessage(message.id)}
                  style={[
                    styles.deleteButton,
                    {
                      borderColor:
                        pendingAction === `chat-delete:${message.id}`
                          ? theme.danger
                          : theme.backgroundSelected,
                    },
                    deletingId === message.id && styles.disabled,
                  ]}
                >
                  {deletingId === message.id ? (
                    <ActivityIndicator color={theme.danger} />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={{
                        color:
                          pendingAction === `chat-delete:${message.id}` ? theme.danger : theme.text,
                      }}
                    >
                      {pendingAction === `chat-delete:${message.id}`
                        ? 'Confirmar eliminación'
                        : 'Eliminar mensaje'}
                    </ThemedText>
                  )}
                </Pressable>
              </ThemedView>
            ))
          )}
          </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress?: () => void;
}) {
  const content = (
    <ThemedView type="backgroundElement" style={styles.metricCard}>
      <ThemedText type="title">{value.toLocaleString('es-CL')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {onPress ? ' ›' : ''}
      </ThemedText>
    </ThemedView>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ${label}`}
      onPress={onPress}
      style={styles.metricPressable}
    >
      {content}
    </Pressable>
  );
}

type AdminReportGroup = {
  userId: string;
  userName: string;
  email: string;
  reporterCount: number;
  reports: AdminChatReport[];
};

function groupAdminReports(reports: AdminChatReport[]): AdminReportGroup[] {
  const groups = new Map<string, AdminReportGroup>();

  for (const report of reports) {
    const current = groups.get(report.reportedUserId);
    if (current) {
      current.reports.push(report);
    } else {
      groups.set(report.reportedUserId, {
        userId: report.reportedUserId,
        userName: report.reportedUserName,
        email: report.reportedUserEmail,
        reporterCount: report.reporterCount,
        reports: [report],
      });
    }
  }

  return [...groups.values()];
}

function StatusTag({ label, positive = false }: { label: string; positive?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statusTag,
        {
          borderColor: positive ? theme.primary : theme.danger,
        },
      ]}
    >
      <ThemedText
        type="small"
        style={{ color: positive ? theme.primary : theme.danger }}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 42,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  refreshButton: {
    minWidth: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  errorCard: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metricPressable: {
    flexGrow: 1,
    flexBasis: 130,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 130,
    minHeight: 96,
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    gap: Spacing.half,
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: Spacing.two,
  },
  messageCard: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  entityCard: {
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  entityHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  entityName: {
    flexShrink: 1,
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  actionButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  messageInfo: {
    gap: Spacing.half,
  },
  reportEvidenceList: {
    gap: Spacing.two,
  },
  reportEvidence: {
    gap: Spacing.half,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: '#80808016',
  },
  reportedHistory: {
    gap: Spacing.two,
  },
  deleteButton: {
    alignSelf: 'flex-end',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.one,
  },
  disabled: {
    opacity: 0.6,
  },
});
