/**
 * Chat conversation — per-channel messages + composer + real-time insert sub.
 *
 * Pattern:
 *   • Fetch last 50 messages on mount (oldest-first in state)
 *   • Subscribe to INSERTs for this channel and append to state
 *   • Composer at the bottom — enter-to-send, multi-line friendly
 *   • KeyboardAvoiding so the composer sits above the keyboard
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  ChatChannel,
  ChatMessage,
  channelDisplayName,
  formatMessageTime,
  getChannel,
  listMessages,
  sendMessage,
  subscribeToChannel,
} from '@/lib/chatService';
import { useAuth } from '@/lib/AuthContext';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export default function ChatChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ─── Load channel + history ───────────────────────────────────────
  const reload = useCallback(async () => {
    if (!channelId) return;
    try {
      const [ch, msgs] = await Promise.all([
        getChannel(channelId),
        listMessages(channelId, { limit: 50 }),
      ]);
      setChannel(ch);
      setMessages(msgs);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  // ─── Real-time subscription ───────────────────────────────────────
  useEffect(() => {
    if (!channelId) return;
    const unsub = subscribeToChannel(channelId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
    return unsub;
  }, [channelId]);

  // Keep the newest message visible after any update
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  const send = useCallback(async () => {
    if (!channelId || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendMessage(channelId, body);
      setDraft('');
      haptics.success();
    } catch (e: any) {
      haptics.error();
      setError(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }, [channelId, draft, sending]);

  const title = useMemo(
    () => (channel ? channelDisplayName(channel) : 'Loading…'),
    [channel]
  );

  const subtitle = channel?.description || undefined;

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item, index }) => {
      const prev = index > 0 ? messages[index - 1] : undefined;
      const showMeta =
        !prev ||
        prev.sender_id !== item.sender_id ||
        new Date(item.created_at).getTime() -
          new Date(prev.created_at).getTime() >
          5 * 60 * 1000;
      const mine = item.sender_id === user?.id;
      return (
        <MessageBubble
          msg={item}
          mine={mine}
          showMeta={showMeta}
        />
      );
    },
    [messages, user?.id]
  );

  return (
    <SafeScreen bottom="apply" disableKeyboardAvoid>
      <Header
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        bordered
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : error && messages.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              title="Couldn't load messages"
              description={error}
            />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              title="No messages yet"
              description="Be the first to break the ice in this channel."
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          sending={sending}
        />
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function MessageBubble({
  msg,
  mine,
  showMeta,
}: {
  msg: ChatMessage;
  mine: boolean;
  showMeta: boolean;
}) {
  const who =
    msg.sender?.full_name || msg.sender?.email?.split('@')[0] || 'Unknown';
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {!mine && (
        <View style={styles.bubbleAvatar}>
          {showMeta ? (
            <Avatar name={who} size="sm" url={msg.sender?.avatar_url ?? undefined} />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
        </View>
      )}
      <View style={[styles.bubbleCol, mine && styles.bubbleColMine]}>
        {showMeta && (
          <View style={[styles.metaRow, mine && styles.metaRowMine]}>
            {!mine && <Text style={styles.metaName}>{who}</Text>}
            <Text style={styles.metaTime}>{formatMessageTime(msg.created_at)}</Text>
          </View>
        )}
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              mine ? styles.bubbleTextMine : styles.bubbleTextOther,
            ]}
          >
            {msg.content}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  sending,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const canSend = value.trim().length > 0 && !sending;
  return (
    <View style={styles.composer}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Message"
        placeholderTextColor={colors.textMuted}
        multiline
        style={styles.input}
        autoCapitalize="sentences"
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        style={({ pressed }) => [
          styles.sendBtn,
          canSend ? styles.sendBtnActive : styles.sendBtnDisabled,
          pressed && canSend && styles.sendBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        <Send
          size={18}
          color={canSend ? colors.textOnAccent : colors.textMuted}
          strokeWidth={2.4}
        />
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },

  // Bubble rows
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  bubbleRowMine: {
    flexDirection: 'row-reverse',
  },
  bubbleAvatar: {
    width: 32,
  },
  avatarSpacer: {
    width: 32,
    height: 32,
  },
  bubbleCol: {
    flex: 1,
    alignItems: 'flex-start',
    maxWidth: '85%',
  },
  bubbleColMine: {
    alignItems: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
    paddingHorizontal: spacing.xs,
  },
  metaRowMine: {
    flexDirection: 'row-reverse',
  },
  metaName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  metaTime: {
    ...typography.micro,
    color: colors.textMuted,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  bubbleOther: {
    backgroundColor: colors.surface800,
    borderBottomLeftRadius: radii.xs,
  },
  bubbleMine: {
    backgroundColor: colors.emerald,
    borderBottomRightRadius: radii.xs,
  },
  bubbleText: {
    ...typography.body,
    lineHeight: 20,
  },
  bubbleTextOther: {
    color: colors.textPrimary,
  },
  bubbleTextMine: {
    color: colors.textOnAccent,
  },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface900,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface800,
    borderRadius: radii.lg,
    color: colors.textPrimary,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: colors.emerald,
  },
  sendBtnDisabled: {
    backgroundColor: colors.surface800,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
});
