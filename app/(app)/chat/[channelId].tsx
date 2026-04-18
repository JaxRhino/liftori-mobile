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
import { Camera, ImagePlus, Send, X } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  ChatAttachment,
  ChatChannel,
  ChatMessage,
  channelDisplayName,
  formatMessageTime,
  getChannel,
  listMessages,
  sendMessage,
  subscribeToChannel,
  uploadChatAttachment,
} from '@/lib/chatService';
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
      await sendMessage(channelId, body, uploaded.length > 0 ? uploaded : null);
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
          onImagePress={(url) => setLightboxUrl(url)}
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
  onImagePress,
}: {
  msg: ChatMessage;
  mine: boolean;
  showMeta: boolean;
  onImagePress: (url: string) => void;
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
});
