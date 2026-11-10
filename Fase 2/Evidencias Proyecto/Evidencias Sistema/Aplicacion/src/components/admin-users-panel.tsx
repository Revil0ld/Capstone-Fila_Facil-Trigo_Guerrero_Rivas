import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { AdminUser } from '@/data/admin';
import { useTheme } from '@/hooks/use-theme';

export const TEMPORARY_BAN_OPTIONS = [
  { hours: 24, label: '1 día' },
  { hours: 24 * 7, label: '7 días' },
  { hours: 24 * 30, label: '30 días' },
] as const;

type AdminUsersPanelProps = {
  users: AdminUser[];
  focusedUserId: string | null;
  busyAction: string | null;
  pendingAction: string | null;
  onClearFocus: () => void;
  onSanction: (user: AdminUser, sanction: 'account' | 'chat') => void;
  onTemporaryBan: (user: AdminUser, hours: number, label: string) => void;
  onOpenChat: (user: AdminUser) => void;
};

const COLUMNS = [
  { key: 'name', title: 'Nombre', width: 160 },
  { key: 'email', title: 'Correo', width: 220 },
  { key: 'phone', title: 'Número', width: 110 },
  { key: 'report', title: 'Mensaje reportado', width: 260 },
] as const;

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export function AdminUsersPanel({
  users,
  focusedUserId,
  busyAction,
  pendingAction,
  onClearFocus,
  onSanction,
  onTemporaryBan,
  onOpenChat,
}: AdminUsersPanelProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(focusedUserId);

  const visibleUsers = useMemo(() => {
    const query = normalize(search.trim());
    return users.filter((user) => {
      if (focusedUserId && user.id !== focusedUserId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return normalize(
        [user.name, user.email, user.phone, user.reportedMessage].filter(Boolean).join(' ')
      ).includes(query);
    });
  }, [users, search, focusedUserId]);

  const selectedUser = users.find((user) => user.id === selectedId) ?? null;
  const focusedUser = focusedUserId ? users.find((user) => user.id === focusedUserId) : null;
  const tableWidth = COLUMNS.reduce((total, column) => total + column.width, 0);

  return (
    <View style={styles.panel}>
      <View style={styles.titleBlock}>
        <ThemedText type="subtitle">Usuarios activos</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Toca una fila para administrar la cuenta. Los cambios requieren confirmación.
        </ThemedText>
      </View>

      {focusedUserId ? (
        <ThemedView type="backgroundElement" style={styles.focusBanner}>
          <ThemedText type="small" style={styles.focusText}>
            Mostrando solo a {focusedUser?.name ?? 'la cuenta reportada'}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={onClearFocus} hitSlop={Spacing.two}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Ver todos
            </ThemedText>
          </Pressable>
        </ThemedView>
      ) : null}

      <ThemedView type="backgroundElement" style={styles.searchBox}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nombre, correo, número o mensaje"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Buscar usuarios"
          style={[styles.searchInput, { color: theme.text }]}
        />
      </ThemedView>

      <ThemedText type="small" themeColor="textSecondary">
        {visibleUsers.length} de {users.length} cuenta(s)
      </ThemedText>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: tableWidth }}>
          <View style={[styles.row, styles.headerRow, { borderBottomColor: theme.backgroundSelected }]}>
            {COLUMNS.map((column) => (
              <View key={column.key} style={[styles.cell, { width: column.width }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {column.title}
                </ThemedText>
              </View>
            ))}
          </View>

          {visibleUsers.length === 0 ? (
            <View style={styles.emptyRow}>
              <ThemedText type="small" themeColor="textSecondary">
                No hay cuentas que coincidan.
              </ThemedText>
            </View>
          ) : (
            visibleUsers.map((user) => {
              const isSelected = user.id === selectedId;
              return (
                <Pressable
                  key={user.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedId(isSelected ? null : user.id)}
                  style={[
                    styles.row,
                    { borderBottomColor: theme.backgroundSelected },
                    isSelected && { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <View style={[styles.cell, { width: COLUMNS[0].width }]}>
                    <ThemedText type="small" numberOfLines={2}>
                      {user.name}
                    </ThemedText>
                  </View>
                  <View style={[styles.cell, { width: COLUMNS[1].width }]}>
                    <ThemedText type="small" numberOfLines={2}>
                      {user.email}
                    </ThemedText>
                  </View>
                  <View style={[styles.cell, { width: COLUMNS[2].width }]}>
                    <ThemedText type="small">{user.phone ?? '—'}</ThemedText>
                  </View>
                  <View style={[styles.cell, { width: COLUMNS[3].width }]}>
                    <ThemedText
                      type="small"
                      numberOfLines={2}
                      themeColor={user.reportedMessage ? 'text' : 'textSecondary'}
                    >
                      {user.reportedMessage ?? '—'}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {selectedUser ? (
        <UserManagementCard
          user={selectedUser}
          busyAction={busyAction}
          pendingAction={pendingAction}
          onSanction={onSanction}
          onTemporaryBan={onTemporaryBan}
          onOpenChat={onOpenChat}
        />
      ) : null}
    </View>
  );
}

function UserManagementCard({
  user,
  busyAction,
  pendingAction,
  onSanction,
  onTemporaryBan,
  onOpenChat,
}: {
  user: AdminUser;
  busyAction: string | null;
  pendingAction: string | null;
  onSanction: (user: AdminUser, sanction: 'account' | 'chat') => void;
  onTemporaryBan: (user: AdminUser, hours: number, label: string) => void;
  onOpenChat: (user: AdminUser) => void;
}) {
  const theme = useTheme();
  const isAdmin = user.role === 'admin';
  const accountAction = `user-account:${user.id}`;
  const chatAction = `user-chat:${user.id}`;
  const isAccountPending = pendingAction === accountAction;
  const isChatPending = pendingAction === chatAction;
  const isBusy = busyAction !== null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.tags}>
        <ThemedText type="smallBold" style={styles.cardName}>
          {user.name}
        </ThemedText>
        {isAdmin ? <Tag label="Admin" positive /> : null}
        {user.isBanned ? (
          <Tag
            label={
              user.bannedUntil
                ? `Suspendida hasta ${formatDate(user.bannedUntil)}`
                : 'Baneo permanente'
            }
          />
        ) : null}
        {user.isChatBanned ? <Tag label="Chat restringido" /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {user.email}
        {user.phone ? ` · ${user.phone}` : ''}
      </ThemedText>
      {user.reportedMessage ? (
        <View style={styles.reportBox}>
          <ThemedText type="smallBold">
            Mensaje reportado{user.reportSupermarketName ? ` en ${user.reportSupermarketName}` : ''}
          </ThemedText>
          <ThemedText type="small">{user.reportedMessage}</ThemedText>
        </View>
      ) : null}

      {user.reportSupermarketId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenChat(user)}
          style={[styles.actionButton, { borderColor: theme.primary }]}
        >
          <ThemedText type="smallBold" style={{ color: theme.primary }}>
            Ir al chat zonal del reporte
          </ThemedText>
        </Pressable>
      ) : null}

      {isAdmin ? (
        <ThemedText type="small" themeColor="textSecondary">
          Las cuentas administradoras no se pueden sancionar.
        </ThemedText>
      ) : (
        <>
          {!user.isBanned ? (
            <View style={styles.group}>
              <ThemedText type="smallBold">Baneo temporal</ThemedText>
              <View style={styles.actionsRow}>
                {TEMPORARY_BAN_OPTIONS.map((option) => {
                  const action = `user-temp:${user.id}:${option.hours}`;
                  const isPending = pendingAction === action;
                  return (
                    <Pressable
                      key={option.hours}
                      accessibilityRole="button"
                      disabled={isBusy}
                      onPress={() => onTemporaryBan(user, option.hours, option.label)}
                      style={[
                        styles.actionButton,
                        { borderColor: isPending ? theme.danger : theme.backgroundSelected },
                        isBusy && styles.disabled,
                      ]}
                    >
                      {busyAction === action ? (
                        <ActivityIndicator color={theme.danger} />
                      ) : (
                        <ThemedText
                          type="smallBold"
                          style={{ color: isPending ? theme.danger : theme.text }}
                        >
                          {isPending ? `Confirmar ${option.label}` : option.label}
                        </ThemedText>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => onSanction(user, 'account')}
              style={[
                styles.actionButton,
                { borderColor: isAccountPending ? theme.danger : theme.backgroundSelected },
                isBusy && styles.disabled,
              ]}
            >
              {busyAction === accountAction ? (
                <ActivityIndicator color={theme.danger} />
              ) : (
                <ThemedText
                  type="smallBold"
                  style={{ color: isAccountPending ? theme.danger : theme.text }}
                >
                  {isAccountPending
                    ? user.isBanned
                      ? 'Confirmar reactivación'
                      : 'Confirmar baneo permanente'
                    : user.isBanned
                      ? 'Reactivar cuenta'
                      : 'Baneo permanente'}
                </ThemedText>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => onSanction(user, 'chat')}
              style={[
                styles.actionButton,
                { borderColor: isChatPending ? theme.danger : theme.backgroundSelected },
                isBusy && styles.disabled,
              ]}
            >
              {busyAction === chatAction ? (
                <ActivityIndicator color={theme.danger} />
              ) : (
                <ThemedText
                  type="smallBold"
                  style={{ color: isChatPending ? theme.danger : theme.text }}
                >
                  {isChatPending
                    ? user.isChatBanned
                      ? 'Confirmar permiso de chat'
                      : 'Confirmar baneo de chat'
                    : user.isChatBanned
                      ? 'Permitir chat'
                      : 'Banear chat'}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ThemedView>
  );
}

function Tag({ label, positive = false }: { label: string; positive?: boolean }) {
  const theme = useTheme();
  const color = positive ? theme.primary : theme.danger;
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.three,
  },
  titleBlock: {
    gap: Spacing.half,
  },
  focusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  focusText: {
    flex: 1,
  },
  searchBox: {
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  searchInput: {
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    borderBottomWidth: 1,
  },
  cell: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  emptyRow: {
    padding: Spacing.four,
    alignItems: 'center',
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one,
  },
  cardName: {
    flexShrink: 1,
  },
  tag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
  },
  reportBox: {
    gap: Spacing.half,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: '#80808016',
  },
  group: {
    gap: Spacing.one,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  disabled: {
    opacity: 0.6,
  },
});
