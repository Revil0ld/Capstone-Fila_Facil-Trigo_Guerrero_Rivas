import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  getSupermarketMessages,
  reportSupermarketChatMessage,
  sendSupermarketMessage,
  type SupermarketChatMessage,
} from '@/data/supermarket-chat';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/context/auth';

const SUPERMARKET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function appendUniqueMessages(
  current: SupermarketChatMessage[],
  incoming: SupermarketChatMessage[]
) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));
  return [...messagesById.values()].sort((a, b) => a.id - b.id);
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export default function SupermarketChatScreen() {
  const theme = useTheme();
  const { isChatBanned } = useSession();
  const { storeId: storeIdParam, name, chain, address } = useLocalSearchParams<{
    storeId?: string;
    name?: string;
    chain?: string;
    address?: string;
  }>();
  const storeId = typeof storeIdParam === 'string' ? storeIdParam : '';
  const hasValidStoreId = SUPERMARKET_ID_PATTERN.test(storeId);
  const supermarketName = typeof name === 'string' ? name : '';
  const supermarketChain = typeof chain === 'string' ? chain : '';
  const supermarketAddress = typeof address === 'string' ? address : '';
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<SupermarketChatMessage[]>([]);
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<number>>(() => new Set());
  const [pendingReportId, setPendingReportId] = useState<number | null>(null);
  const [reportingMessageId, setReportingMessageId] = useState<number | null>(null);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let isPolling = false;
    let latestMessageId = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    if (!hasValidStoreId) {
      return;
    }

    async function loadInitialMessages() {
      try {
        const initialMessages = await getSupermarketMessages(storeId);
        if (!isActive) {
          return;
        }
        setMessages(initialMessages);
        latestMessageId = initialMessages.at(-1)?.id ?? 0;
        setError(null);
      } catch (loadError) {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No se pudieron cargar los mensajes.'
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    async function pollMessages() {
      if (!isActive || isPolling) {
        return;
      }

      isPolling = true;
      try {
        const updates = await getSupermarketMessages(storeId, latestMessageId);
        if (isActive && updates.length > 0) {
          latestMessageId = Math.max(latestMessageId, updates.at(-1)?.id ?? latestMessageId);
          setMessages((current) => appendUniqueMessages(current, updates));
          setError(null);
        }
      } catch (pollError) {
        if (isActive) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : 'No se pudieron actualizar los mensajes.'
          );
        }
      } finally {
        isPolling = false;
      }
    }

    void loadInitialMessages().finally(() => {
      if (isActive) {
        interval = setInterval(() => void pollMessages(), 3_000);
      }
    });

    return () => {
      isActive = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [hasValidStoreId, storeId]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || isSending || !hasValidStoreId) {
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      const sentMessage = await sendSupermarketMessage(storeId, text);
      setMessages((current) => appendUniqueMessages(current, [sentMessage]));
      setDraft('');
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : 'No se pudo enviar el mensaje.'
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleReportMessage(messageId: number) {
    if (pendingReportId !== messageId) {
      setPendingReportId(messageId);
      setReportNotice(null);
      return;
    }

    setReportingMessageId(messageId);
    setPendingReportId(null);
    setReportNotice(null);
    setError(null);
    try {
      await reportSupermarketChatMessage(messageId);
      setReportedMessageIds((current) => new Set(current).add(messageId));
      setReportNotice('Reporte enviado. Gracias por ayudar a mantener respetuoso el chat.');
    } catch (reportError) {
      setError(
        reportError instanceof Error ? reportError.message : 'No se pudo enviar el reporte.'
      );
    } finally {
      setReportingMessageId(null);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
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
            <ThemedText type="smallBold" numberOfLines={1}>
              {supermarketName || 'Chat del supermercado'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {supermarketChain || supermarketAddress || 'Chat grupal'}
            </ThemedText>
          </View>
        </View>

        {error || !hasValidStoreId ? (
          <ThemedView type="backgroundElement" style={styles.errorBanner} accessibilityRole="alert">
            <ThemedText type="small" themeColor="danger">
              {error ?? 'No se recibió un identificador válido para este supermercado.'}
            </ThemedText>
          </ThemedView>
        ) : null}
        {isChatBanned ? (
          <ThemedView type="backgroundElement" style={styles.errorBanner}>
            <ThemedText type="small" themeColor="danger">
              Tu cuenta tiene restringido el envío de mensajes. Puedes seguir leyendo el chat.
            </ThemedText>
          </ThemedView>
        ) : null}

        {isLoading && hasValidStoreId ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.primary} />
            <ThemedText type="small" themeColor="textSecondary">
              Cargando conversación…
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <ThemedView type="backgroundElement" style={styles.chatIcon}>
                  <ThemedText style={styles.chatEmoji}>💬</ThemedText>
                </ThemedView>
                <ThemedText type="smallBold">¡Inicia la conversación!</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  Comparte información útil sobre este supermercado con otras personas.
                </ThemedText>
              </View>
            ) : (
              messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    message.isMine ? styles.ownMessageRow : styles.otherMessageRow,
                  ]}
                >
                  <View
                    style={[
                      styles.messageColumn,
                      message.isMine ? styles.ownMessageColumn : styles.otherMessageColumn,
                    ]}
                  >
                    <ThemedView
                      type={message.isMine ? 'backgroundSelected' : 'backgroundElement'}
                      style={styles.messageBubble}
                    >
                      {!message.isMine ? (
                        <ThemedText type="smallBold" themeColor="primary">
                          {message.author}
                        </ThemedText>
                      ) : null}
                      <ThemedText>{message.text}</ThemedText>
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        style={styles.messageTime}
                      >
                        {formatMessageTime(message.createdAt)}
                      </ThemedText>
                    </ThemedView>
                    {!message.isMine && message.isReportable ? (
                      reportedMessageIds.has(message.id) ? (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.reportHint}>
                          Reportado
                        </ThemedText>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          disabled={reportingMessageId !== null}
                          onPress={() => void handleReportMessage(message.id)}
                          style={styles.reportButton}
                        >
                          {reportingMessageId === message.id ? (
                            <ActivityIndicator size="small" color={theme.danger} />
                          ) : (
                            <ThemedText
                              type="small"
                              style={{
                                color:
                                  pendingReportId === message.id ? theme.danger : theme.textSecondary,
                              }}
                            >
                              {pendingReportId === message.id
                                ? 'Confirmar reporte'
                                : 'Reportar mensaje'}
                            </ThemedText>
                          )}
                        </Pressable>
                      )
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
          )}

          {reportNotice ? (
            <ThemedView type="backgroundElement" style={styles.reportNotice}>
              <ThemedText type="small">{reportNotice}</ThemedText>
            </ThemedView>
          ) : null}

        <View style={[styles.composer, { borderTopColor: theme.backgroundSelected }]}>
          <TextInput
            accessibilityLabel="Escribe un mensaje"
            value={draft}
            onChangeText={setDraft}
            placeholder="Escribe un mensaje…"
            placeholderTextColor={theme.textSecondary}
            maxLength={500}
            multiline
            editable={!isSending && hasValidStoreId && !isChatBanned}
            returnKeyType="default"
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            disabled={isSending || !draft.trim() || !hasValidStoreId || isChatBanned}
            onPress={() => void handleSend()}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
              (isSending || !draft.trim() || isChatBanned) && styles.disabled,
            ]}
          >
            {isSending ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <ThemedText type="smallBold" themeColor="primaryForeground">
                Enviar
              </ThemedText>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    minHeight: 68,
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
  backArrow: {
    fontSize: 38,
    lineHeight: 42,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  errorBanner: {
    margin: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 360,
  },
  chatIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  chatEmoji: {
    fontSize: 30,
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
  },
  ownMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '86%',
    minWidth: 84,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    gap: Spacing.half,
  },
  messageColumn: {
    maxWidth: '86%',
    gap: Spacing.half,
  },
  ownMessageColumn: {
    alignItems: 'flex-end',
  },
  otherMessageColumn: {
    alignItems: 'flex-start',
  },
  reportButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  reportHint: {
    paddingHorizontal: Spacing.one,
  },
  reportNotice: {
    marginHorizontal: Spacing.two,
    marginBottom: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  messageTime: {
    alignSelf: 'flex-end',
    fontSize: 11,
    lineHeight: 15,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 112,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  sendButton: {
    minWidth: 72,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: 22,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
});
