/**
 * Chat conversation — per-channel messages + composer + real-time insert sub.
 *
 * Wave 12 additions:
 *   • Camera + gallery buttons in the composer (expo-image-picker already
 *     installed; app.config.ts already grants NSCameraUsageDescription +
 *     NSPhotoLibraryUsageDescription and the Android CAMERA permission).
 *   • Attachment preview strip above the text input before sending.
 *   • Image rendering in MessageBubble with tap-to-expand lightbox.
 *   • Uploads land in the shared `chat-files` Supabase bucket with the
 *     same JSON shape the admin web app posts, so cross-posting works.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  ListRenderItem,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, Send, Smile, Video, X } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  ChatAttachment,
  ChatChannel,
  ChatChannelMember,
  ChatMessage,
  ChatReaction,
  channelDisplayName,
  formatMessageTime,
  getChannel,
  groupReactions,
  listChannelMembers,
  listMessages,
  listReactions,
  markChannelRead,
  sendMessage,
  subscribeToChannel,
  toggleReaction,
  uploadChatAttachment,
} from '@/lib/chatService';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type PendingAttachment = {
  /** Temp key for the preview strip. */
  key: string;
  localUri: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

export default function ChatChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [channel, setChannel] = useState<ChatChannel | null>(null);
  const [members, setMembers] = useState<ChatChannelMember[]>([]);
  const [partnerProfile, setPartnerProfile] = useState<{
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Map<string, ChatReaction[]>>(new Map());
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [reactionTarget, setReactionTarget] = useState<ChatMessage | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ─── Load channel + history ───────────────────────────────────────
  const reload = useCallback(async () => {
    if (!channelId) return;
    try {
      const [ch, msgs, mems] = await Promise.all([
        getChannel(channelId),
        listMessages(channelId, { limit: 50 }),
        listChannelMembers(channelId).catch(() => [] as ChatChannelMember[]),
      ]);
      setChannel(ch);
      setMembers(mems);
      setMessages(msgs);

      // Resolve DM counterparty profile for the header avatar + title
      if (ch?.type === 'direct' && user?.id) {
        const other = mems.find((m) => m.user_id !== user.id);
        if (other) {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .eq('id', other.user_id)
            .maybeSingle();
          setPartnerProfile((data as typeof partnerProfile) || null);
        }
      } else {
        setPartnerProfile(null);
      }

      // Pull reactions for the loaded messages in one shot
      if (msgs.length) {
        const rxs = await listReactions(msgs.map((m) => m.id)).catch(
          () => [] as ChatReaction[]
        );
        const map = new Map<string, ChatReaction[]>();
        for (const r of rxs) {
          const arr = map.get(r.message_id) || [];
          arr.push(r);
          map.set(r.message_id, arr);
        }
        setReactions(map);
      } else {
        setReactions(new Map());
      }

      // Mark the channel as read on load so the Chat tab badge clears
      markChannelRead(channelId).catch(() => {});
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [channelId, user?.id]);

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
      // The user is actively viewing — keep the badge clear
      void markChannelRead(channelId).catch(() => {});
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

  // ─── Attachment handlers ──────────────────────────────────────────
  const pickFromLibrary = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo access needed',
          'Enable Photos permission in Settings to attach images.'
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 6,
      });
      if (res.canceled) return;
      const next: PendingAttachment[] = res.assets.map((a, i) => ({
        key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        localUri: a.uri,
        filename: a.fileName ?? undefined,
        mimeType: a.mimeType ?? undefined,
        width: a.width,
        height: a.height,
      }));
      setPending((prev) => [...prev, ...next].slice(0, 6));
      haptics.tap();
    } catch (e: any) {
      setError(e?.message || 'Couldn\u2019t open library');
    }
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera access needed',
          'Enable Camera permission in Settings to take photos.'
        );
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      setPending((prev) =>
        [
          ...prev,
          {
            key: `${Date.now()}-cam-${Math.random().toString(36).slice(2, 7)}`,
            localUri: a.uri,
            filename: a.fileName ?? undefined,
            mimeType: a.mimeType ?? undefined,
            width: a.width,
            height: a.height,
          },
        ].slice(0, 6)
      );
      haptics.tap();
    } catch (e: any) {
      setError(e?.message || 'Couldn\u2019t open camera');
    }
  }, []);

  const removePending = useCallback((key: string) => {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }, []);

  // ─── Send ─────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!channelId || sending) return;
    const body = draft.trim();
    const hasAttachments = pending.length > 0;
    if (!body && !hasAttachments) return;
    setSending(true);
    try {
      let uploaded: ChatAttachment[] = [];
      if (hasAttachments) {
        uploaded = await Promise.all(
          pending.map((p) =>
            uploadChatAttachment(p.localUri, {
              filename: p.filename,
              mimeType: p.mimeType,
              width: p.width,
              height: p.height,
            })
          )
        );
      }
      await sendMessage(channelId, body, {
        attachments: uploaded.length > 0 ? uploaded : null,
      });
      setDraft('');
      setPending([]);
      haptics.success();
    } catch (e: any) {
      haptics.error();
      setError(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }, [channelId, draft, pending, sending]);

  const title = useMemo(() => {
    if (!channel) return 'Loading…';
    if (channel.type === 'direct') {
      return (
        partnerProfile?.full_name ||
        partnerProfile?.email?.split('@')[0] ||
        channelDisplayName(channel, {
          myUserId: user?.id,
          members: members.map((m) => ({ user_id: m.user_id })),
        })
      );
    }
    return channelDisplayName(channel);
  }, [channel, partnerProfile, members, user?.id]);

  const subtitle = channel?.type === 'direct'
    ? (partnerProfile?.email || undefined)
    : channel?.description || undefined;

  // Video call — opens a stable per-channel room URL. For v1 we rely on
  // Daily.co's prebuilt page (no SDK required) — the room slug is
  // deterministic so both sides join the same room. Task #15 will swap
  // this for an embedded WebRTC SDK.
  const startVideoCall = useCallback(() => {
    if (!channelId) return;
    const slug = `liftori-${channelId.slice(0, 12)}`;
    const url = `https://liftori.daily.co/${slug}`;
    haptics.tap();
    Alert.alert(
      'Start video call?',
      'This opens a secure Daily.co room in your browser. Share the link with anyone else you want on the call.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start call',
          onPress: async () => {
            // Post the room URL into the channel so other members can join
            try {
              await sendMessage(channelId, `📹 Video call started: ${url}`);
            } catch {
              /* non-fatal */
            }
            // Open the URL in the user's browser (Linking ships with RN core)
            try {
              await Linking.openURL(url);
            } catch (e: any) {
              setError(e?.message || 'Could not open video call');
            }
          },
        },
      ]
    );
  }, [channelId]);

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        const res = await toggleReaction(messageId, emoji);
        // Optimistic-ish: update local map
        setReactions((prev) => {
          const next = new Map(prev);
          const arr = (next.get(messageId) || []).slice();
          if (res.added) {
            arr.push({
              id: `tmp-${Date.now()}`,
              message_id: messageId,
              user_id: user?.id ?? '',
              user_name:
                user?.user_metadata?.full_name ||
                user?.email?.split('@')[0] ||
                '',
              emoji,
              created_at: new Date().toISOString(),
            });
          } else {
            const idx = arr.findIndex(
              (r) => r.emoji === emoji && r.user_id === user?.id
            );
            if (idx >= 0) arr.splice(idx, 1);
          }
          next.set(messageId, arr);
          return next;
        });
        haptics.tap();
      } catch (e: any) {
        setError(e?.message || 'Reaction failed');
      }
    },
    [user?.id, user?.email, user?.user_metadata?.full_name]
  );

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
      const rx = reactions.get(item.id) || [];
      return (
        <MessageBubble
          msg={item}
          mine={mine}
          showMeta={showMeta}
          reactions={rx}
          myUserId={user?.id}
          onImagePress={(url) => setLightboxUrl(url)}
          onLongPress={() => {
            haptics.bump();
            setReactionTarget(item);
          }}
          onTogglePill={(emoji) => handleToggleReaction(item.id, emoji)}
        />
      );
    },
    [messages, reactions, user?.id, handleToggleReaction]
  );

  return (
    <SafeScreen bottom="apply" disableKeyboardAvoid>
      <Header
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        bordered
        trailing={
          <Pressable
            onPress={startVideoCall}
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Start video call"
          >
            <Video size={22} color={colors.emerald} strokeWidth={2.2} />
          </Pressable>
        }
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

        {pending.length > 0 && (
          <PendingStrip items={pending} onRemove={removePending} />
        )}

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onPickLibrary={pickFromLibrary}
          onTakePhoto={takePhoto}
          sending={sending}
          hasPending={pending.length > 0}
        />
      </KeyboardAvoidingView>

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      <ReactionPicker
        target={reactionTarget}
        onClose={() => setReactionTarget(null)}
        onPick={(emoji) => {
          if (!reactionTarget) return;
          const id = reactionTarget.id;
          setReactionTarget(null);
          void handleToggleReaction(id, emoji);
        }}
      />
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
  reactions,
  myUserId,
  onImagePress,
  onLongPress,
  onTogglePill,
}: {
  msg: ChatMessage;
  mine: boolean;
  showMeta: boolean;
  reactions: ChatReaction[];
  myUserId: string | undefined;
  onImagePress: (url: string) => void;
  onLongPress: () => void;
  onTogglePill: (emoji: string) => void;
}) {
  const who =
    msg.sender?.full_name || msg.sender?.email?.split('@')[0] || 'Unknown';
  const atts = (msg.attachments || []).filter((a) => !!a?.url);
  const images = atts.filter((a) => a.file_type === 'image');
  const files = atts.filter((a) => a.file_type !== 'image');
  // If content is just the placeholder we add for pure-attachment messages,
  // hide the text bubble so we don't show a lonely camera emoji.
  const isPlaceholder =
    images.length > 0 && (msg.content === '📷' || msg.content === '📎');
  const showText = !!msg.content && !isPlaceholder;
  const groupedReactions = groupReactions(reactions, myUserId);

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

        <Pressable
          onLongPress={onLongPress}
          delayLongPress={250}
          style={[
            styles.bubbleContentCol,
            mine && styles.bubbleColMine,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Message — long press to react"
        >
          {images.length > 0 && (
            <View
              style={[
                styles.imageGrid,
                mine ? styles.imageGridMine : styles.imageGridOther,
              ]}
            >
              {images.map((img) => (
                <Pressable
                  key={img.url}
                  onPress={() => onImagePress(img.url)}
                  onLongPress={onLongPress}
                  delayLongPress={250}
                  style={styles.imageTile}
                >
                  <Image
                    source={{ uri: img.url }}
                    style={styles.imageTileImg}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </View>
          )}

          {showText && (
            <View
              style={[
                styles.bubble,
                mine ? styles.bubbleMine : styles.bubbleOther,
                images.length > 0 && styles.bubbleAfterImage,
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
          )}

          {files.map((f) => (
            <View
              key={f.url}
              style={[
                styles.filePill,
                mine ? styles.filePillMine : styles.filePillOther,
              ]}
            >
              <Text
                style={[
                  styles.fileName,
                  mine ? styles.bubbleTextMine : styles.bubbleTextOther,
                ]}
                numberOfLines={1}
              >
                📎 {f.filename}
              </Text>
            </View>
          ))}
        </Pressable>

        {groupedReactions.length > 0 && (
          <View
            style={[
              styles.reactionRow,
              mine ? styles.reactionRowMine : styles.reactionRowOther,
            ]}
          >
            {groupedReactions.map((g) => (
              <Pressable
                key={g.emoji}
                onPress={() => onTogglePill(g.emoji)}
                style={({ pressed }) => [
                  styles.reactionPill,
                  g.byMe && styles.reactionPillMine,
                  pressed && styles.reactionPillPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${g.emoji} ${g.count} reaction${
                  g.count === 1 ? '' : 's'
                }${g.byMe ? ', including yours' : ''}`}
              >
                <Text style={styles.reactionEmoji}>{g.emoji}</Text>
                <Text
                  style={[
                    styles.reactionCount,
                    g.byMe && styles.reactionCountMine,
                  ]}
                >
                  {g.count}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function PendingStrip({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (key: string) => void;
}) {
  return (
    <View style={styles.pendingStrip}>
      {items.map((p) => (
        <View key={p.key} style={styles.pendingTile}>
          <Image source={{ uri: p.localUri }} style={styles.pendingImg} />
          <Pressable
            onPress={() => onRemove(p.key)}
            style={styles.pendingRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
          >
            <X size={12} color={colors.textOnAccent} strokeWidth={2.6} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  onPickLibrary,
  onTakePhoto,
  sending,
  hasPending,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onPickLibrary: () => void;
  onTakePhoto: () => void;
  sending: boolean;
  hasPending: boolean;
}) {
  const canSend = (value.trim().length > 0 || hasPending) && !sending;
  return (
    <View style={styles.composer}>
      <Pressable
        onPress={onTakePhoto}
        disabled={sending}
        style={({ pressed }) => [
          styles.attachBtn,
          pressed && styles.attachBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Take photo"
      >
        <Camera size={20} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>

      <Pressable
        onPress={onPickLibrary}
        disabled={sending}
        style={({ pressed }) => [
          styles.attachBtn,
          pressed && styles.attachBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Pick photo from library"
      >
        <ImagePlus size={20} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Message"
        placeholderTextColor={colors.textMuted}
        multiline
        style={styles.input}
        autoCapitalize="sentences"
        editable={!sending}
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
        {sending ? (
          <ActivityIndicator size="small" color={colors.textOnAccent} />
        ) : (
          <Send
            size={18}
            color={canSend ? colors.textOnAccent : colors.textMuted}
            strokeWidth={2.4}
          />
        )}
      </Pressable>
    </View>
  );
}

function ReactionPicker({
  target,
  onClose,
  onPick,
}: {
  target: ChatMessage | null;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const EMOJIS = ['❤️', '👍', '👎', '😂', '🎉', '🔥', '👀', '✅'];
  return (
    <Modal
      visible={!!target}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.reactionBackdrop} onPress={onClose}>
        <Pressable style={styles.reactionSheet} onPress={() => {}}>
          <View style={styles.reactionSheetHandle} />
          <Text style={styles.reactionSheetTitle}>Add a reaction</Text>
          <View style={styles.reactionGrid}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => onPick(e)}
                style={({ pressed }) => [
                  styles.reactionGridBtn,
                  pressed && styles.reactionGridBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`React with ${e}`}
              >
                <Text style={styles.reactionGridEmoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Lightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!url}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.lightboxBackdrop} onPress={onClose}>
        {url && (
          <Image
            source={{ uri: url }}
            style={styles.lightboxImg}
            resizeMode="contain"
          />
        )}
        <Pressable
          onPress={onClose}
          style={styles.lightboxClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close preview"
        >
          <X size={22} color="#fff" strokeWidth={2.4} />
        </Pressable>
      </Pressable>
    </Modal>
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
  bubbleAfterImage: {
    marginTop: 4,
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

  // Image attachments in bubbles
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    maxWidth: 260,
  },
  imageGridMine: {
    justifyContent: 'flex-end',
  },
  imageGridOther: {
    justifyContent: 'flex-start',
  },
  imageTile: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface800,
  },
  imageTileImg: {
    width: 200,
    height: 200,
    maxWidth: 260,
  },

  // Generic (non-image) file pill
  filePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    marginTop: 4,
  },
  filePillMine: {
    backgroundColor: colors.emerald,
  },
  filePillOther: {
    backgroundColor: colors.surface800,
  },
  fileName: {
    ...typography.body,
    fontSize: 13,
  },

  // Pending attachment strip (above composer)
  pendingStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface900,
  },
  pendingTile: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface800,
  },
  pendingImg: {
    width: '100%',
    height: '100%',
  },
  pendingRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
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
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface800,
  },
  attachBtnPressed: {
    opacity: 0.7,
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

  // Lightbox
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  lightboxImg: {
    width: '100%',
    height: '100%',
  },
  lightboxClose: {
    position: 'absolute',
    top: 48,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header trailing icon (video call)
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnPressed: {
    opacity: 0.6,
  },

  // Bubble content wrapper (for long-press)
  bubbleContentCol: {
    alignItems: 'flex-start',
  },

  // Reaction pills under bubbles
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  reactionRowMine: {
    justifyContent: 'flex-end',
  },
  reactionRowOther: {
    justifyContent: 'flex-start',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  reactionPillMine: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: colors.emerald,
  },
  reactionPillPressed: {
    opacity: 0.7,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 11,
  },
  reactionCountMine: {
    color: colors.emerald,
  },

  // Reaction picker (bottom sheet modal)
  reactionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  reactionSheet: {
    backgroundColor: colors.surface900,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reactionSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  reactionSheetTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reactionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reactionGridBtn: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface800,
  },
  reactionGridBtnPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  reactionGridEmoji: {
    fontSize: 28,
  },
});
