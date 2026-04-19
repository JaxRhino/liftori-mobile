/**
 * chatService — Liftori's Slack-style chat backend helpers (mobile).
 *
 * Matches the real production schema (verified against
 * liftori-admin/src/pages/Chat.jsx + information_schema):
 *
 *   chat_channels            name, description, type, created_by, is_archived
 *   chat_channel_members     channel_id, user_id, role
 *   chat_messages            channel_id, sender_id, sender_name, sender_role,
 *                            sender_avatar_url, sender_title, content,
 *                            attachments (jsonb), thread_id, is_pinned,
 *                            is_deleted, edited_at
 *   chat_reactions           message_id, user_id, user_name, emoji
 *   chat_notification_reads  channel_id, user_id, last_read_at
 *   chat_user_preferences    user_id, starred_channels[], muted_channels[],
 *                            status, status_text, status_emoji
 *   chat_announcements       channel_id, sender_id, sender_name, title, content,
 *                            priority, expires_at
 *   chat_announcement_acks   announcement_id, user_id
 *   chat_saved_messages      user_id, message_id
 *
 * `chat_channels.type` is the single discriminator:
 *   'public'  — internal team channel, anyone with chat access can join
 *   'private' — invite-only team channel (members in chat_channel_members)
 *   'direct'  — 1:1 DM — exactly two chat_channel_members rows
 *
 * The web admin is the source of truth for query shapes — mirror exactly so
 * cross-posting works.
 */
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────
export type ChannelType = 'public' | 'private' | 'direct';

export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  type: ChannelType;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  is_archived: boolean;
}

export interface ChatChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | string;
  joined_at: string;
}

/**
 * Attachment shape that mirrors the admin web app — posted to the
 * `chat-files` public storage bucket at `chat/{userId}/{timestamp}.{ext}`.
 * Both mobile + admin render the same JSON, so cross-posting works.
 */
export interface ChatAttachment {
  url: string;
  size: number;
  filename: string;
  /** 'image' for renderable inline, 'file' for generic download link. */
  file_type: 'image' | 'file' | 'video';
  /** Optional — populated when uploader knows the dimensions. */
  width?: number;
  height?: number;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  user_name: string | null;
  emoji: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_role: string | null;
  sender_avatar_url: string | null;
  sender_title: string | null;
  content: string;
  attachments: ChatAttachment[] | null;
  thread_id: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  edited_at: string | null;
  created_at: string;
  /** Joined profile — nullable because older rows may not resolve. */
  sender?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  /** Populated opportunistically when the caller requests reactions. */
  reactions?: ChatReaction[];
}

export interface ChatUserPreferences {
  id: string;
  user_id: string;
  starred_channels: string[];
  muted_channels: string[];
  status: 'online' | 'away' | 'dnd' | 'offline' | string;
  status_text: string;
  status_emoji: string;
  updated_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────
function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[chatService] ${label}:`, e);
  throw e;
}

async function currentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return user;
}

const MESSAGE_SELECT =
  '*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, email, avatar_url)';

// ─── Channel reads ───────────────────────────────────────────────────
/**
 * All non-archived channels visible to the signed-in user. RLS scopes the
 * result — for customers, this returns only their DM channel(s) and any
 * channels they've been added to.
 */
export async function listChannels(): Promise<ChatChannel[]> {
  try {
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ChatChannel[]) || [];
  } catch (e) {
    err(e, 'listChannels');
  }
}

export async function getChannel(channelId: string): Promise<ChatChannel | null> {
  try {
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();
    if (error) throw error;
    return (data as ChatChannel) || null;
  } catch (e) {
    err(e, 'getChannel');
  }
}

/** Membership rows for a channel — used to resolve "who's the other DM party". */
export async function listChannelMembers(channelId: string): Promise<ChatChannelMember[]> {
  try {
    const { data, error } = await supabase
      .from('chat_channel_members')
      .select('*')
      .eq('channel_id', channelId);
    if (error) throw error;
    return (data as ChatChannelMember[]) || [];
  } catch (e) {
    err(e, 'listChannelMembers');
  }
}

// ─── Channel writes ──────────────────────────────────────────────────
/**
 * Create a new public/private channel. Inserts the creator as owner into
 * `chat_channel_members` in the same round-trip so RLS-scoped reads see
 * the channel immediately.
 */
export async function createChannel(input: {
  name: string;
  description?: string;
  type?: Exclude<ChannelType, 'direct'>;
}): Promise<ChatChannel> {
  try {
    const user = await currentUser();
    const name = input.name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) throw new Error('Channel name required');
    const { data, error } = await supabase
      .from('chat_channels')
      .insert({
        name,
        description: input.description?.trim() || '',
        type: input.type || 'public',
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    await supabase
      .from('chat_channel_members')
      .insert({ channel_id: data.id, user_id: user.id, role: 'owner' });
    return data as ChatChannel;
  } catch (e) {
    err(e, 'createChannel');
  }
}

/** Soft-delete a channel (hard-delete — not using is_archived). `general` is protected. */
export async function deleteChannel(channelId: string): Promise<void> {
  try {
    const ch = await getChannel(channelId);
    if (ch?.name?.toLowerCase() === 'general') {
      throw new Error('The #general channel cannot be deleted.');
    }
    const { error } = await supabase.from('chat_channels').delete().eq('id', channelId);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteChannel');
  }
}

/**
 * Find an existing DM channel between the signed-in user and `otherUserId`,
 * or create a new one. Returns the channel. Mirrors the admin web flow:
 * creates two `chat_channel_members` rows (self: owner, other: member).
 */
export async function findOrCreateDM(otherUserId: string): Promise<ChatChannel> {
  try {
    const user = await currentUser();
    if (user.id === otherUserId) throw new Error('Cannot DM yourself');

    // Search: direct channels whose membership includes BOTH userIds.
    const { data: existing, error: exErr } = await supabase
      .from('chat_channels')
      .select('id, chat_channel_members(user_id)')
      .eq('type', 'direct');
    if (exErr) throw exErr;

    const match = (existing || []).find((c: { chat_channel_members?: { user_id: string }[] }) => {
      const ids = (c.chat_channel_members || []).map((m) => m.user_id);
      return ids.includes(user.id) && ids.includes(otherUserId);
    });

    if (match) {
      const { data } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('id', (match as { id: string }).id)
        .single();
      return data as ChatChannel;
    }

    // Fetch the other user's display name to name the DM. DMs don't
    // render with `#name` anyway (UI uses `channelDisplayName`), but a
    // stable slug helps debugging on the web admin side.
    const { data: other } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', otherUserId)
      .maybeSingle();
    const otherName =
      (other?.full_name || other?.email?.split('@')[0] || 'user').toLowerCase();
    const selfName =
      (user.user_metadata?.full_name || user.email?.split('@')[0] || 'user').toLowerCase();
    const dmName = `dm-${[selfName, otherName].sort().join('-')}`.slice(0, 60);

    const { data: created, error: createErr } = await supabase
      .from('chat_channels')
      .insert({ name: dmName, description: '', type: 'direct', created_by: user.id })
      .select()
      .single();
    if (createErr) throw createErr;

    const { error: memErr } = await supabase.from('chat_channel_members').insert([
      { channel_id: created.id, user_id: user.id,      role: 'owner' },
      { channel_id: created.id, user_id: otherUserId,   role: 'member' },
    ]);
    if (memErr) throw memErr;

    return created as ChatChannel;
  } catch (e) {
    err(e, 'findOrCreateDM');
  }
}

// ─── Message reads ───────────────────────────────────────────────────
export async function listMessages(
  channelId: string,
  { limit = 50, before }: { limit?: number; before?: string } = {}
): Promise<ChatMessage[]> {
  try {
    let q = supabase
      .from('chat_messages')
      .select(MESSAGE_SELECT)
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) throw error;
    // Oldest-first for render convenience
    return ((data as ChatMessage[]) || []).slice().reverse();
  } catch (e) {
    err(e, 'listMessages');
  }
}

export async function getLastMessage(channelId: string): Promise<ChatMessage | null> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as ChatMessage) || null;
  } catch (e) {
    err(e, 'getLastMessage');
  }
}

/**
 * Fetch all replies in a thread (messages whose `thread_id` matches the
 * parent message id). Parent is fetched separately via getMessage.
 */
export async function listThreadReplies(parentMessageId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(MESSAGE_SELECT)
      .eq('thread_id', parentMessageId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ChatMessage[]) || [];
  } catch (e) {
    err(e, 'listThreadReplies');
  }
}

// ─── Message writes ──────────────────────────────────────────────────
export async function sendMessage(
  channelId: string,
  content: string,
  opts: {
    attachments?: ChatAttachment[] | null;
    threadId?: string | null;
  } = {}
): Promise<ChatMessage> {
  try {
    const { attachments = null, threadId = null } = opts;
    const trimmed = content.trim();
    const hasAttachments = !!attachments && attachments.length > 0;
    if (!trimmed && !hasAttachments) throw new Error('Message is empty');
    const user = await currentUser();

    // content is NOT NULL — stamp a lightweight glyph for pure-attachment messages
    const body =
      trimmed ||
      (hasAttachments
        ? attachments![0].file_type === 'image'
          ? '[image]'
          : attachments![0].file_type === 'video'
            ? '[video]'
            : '[file]'
        : '');

    // chat_messages requires sender_name NOT NULL — denormalize from profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email, avatar_url, role, title')
      .eq('id', user.id)
      .maybeSingle();
    const senderName =
      prof?.full_name || prof?.email?.split('@')[0] || user.email?.split('@')[0] || 'Unknown';

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        sender_name: senderName,
        sender_role: prof?.role || null,
        sender_avatar_url: prof?.avatar_url || null,
        sender_title: prof?.title || null,
        content: body,
        attachments: hasAttachments ? attachments : null,
        thread_id: threadId,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return data as ChatMessage;
  } catch (e) {
    err(e, 'sendMessage');
  }
}

export async function editMessage(messageId: string, newContent: string): Promise<ChatMessage> {
  try {
    const trimmed = newContent.trim();
    if (!trimmed) throw new Error('Cannot save empty message');
    const { data, error } = await supabase
      .from('chat_messages')
      .update({ content: trimmed, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw error;
    return data as ChatMessage;
  } catch (e) {
    err(e, 'editMessage');
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  try {
    const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteMessage');
  }
}

export async function togglePinMessage(messageId: string, pinned: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from('chat_messages')
      .update({ is_pinned: pinned })
      .eq('id', messageId);
    if (error) throw error;
  } catch (e) {
    err(e, 'togglePinMessage');
  }
}

// ─── Reactions ───────────────────────────────────────────────────────
export async function listReactions(messageIds: string[]): Promise<ChatReaction[]> {
  if (!messageIds.length) return [];
  try {
    const { data, error } = await supabase
      .from('chat_reactions')
      .select('*')
      .in('message_id', messageIds);
    if (error) throw error;
    return (data as ChatReaction[]) || [];
  } catch (e) {
    err(e, 'listReactions');
  }
}

/**
 * Toggle a reaction — if the signed-in user already has this emoji on the
 * message it's removed, otherwise it's added. Returns the net state.
 */
export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<{ added: boolean }> {
  try {
    const user = await currentUser();
    const { data: existing } = await supabase
      .from('chat_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from('chat_reactions').delete().eq('id', existing.id);
      if (error) throw error;
      return { added: false };
    }
    // Fetch the denormalized display name once
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    const userName =
      prof?.full_name || prof?.email?.split('@')[0] || user.email?.split('@')[0] || '';
    const { error } = await supabase
      .from('chat_reactions')
      .insert({ message_id: messageId, user_id: user.id, user_name: userName, emoji });
    if (error) throw error;
    return { added: true };
  } catch (e) {
    err(e, 'toggleReaction');
  }
}

// ─── Unread tracking ─────────────────────────────────────────────────
/**
 * Unread count for a channel — messages authored by someone else since
 * the user's `last_read_at`. Uses a HEAD count so no rows come back.
 */
export async function getUnreadCount(channelId: string): Promise<number> {
  try {
    const user = await currentUser();
    const { data: read } = await supabase
      .from('chat_notification_reads')
      .select('last_read_at')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    let q = supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .neq('sender_id', user.id);
    if (read?.last_read_at) q = q.gt('created_at', read.last_read_at);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    err(e, 'getUnreadCount');
  }
}

/** Mark the given channel as read up to "now" for the signed-in user. */
export async function markChannelRead(channelId: string): Promise<void> {
  try {
    const user = await currentUser();
    const nowIso = new Date().toISOString();
    // Try update first; if no row exists, insert.
    const { data: existing } = await supabase
      .from('chat_notification_reads')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from('chat_notification_reads')
        .update({ last_read_at: nowIso })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('chat_notification_reads')
        .insert({ channel_id: channelId, user_id: user.id, last_read_at: nowIso });
      if (error) throw error;
    }
  } catch (e) {
    err(e, 'markChannelRead');
  }
}

/** Sum of unread counts across every channel the user can see. */
export async function getTotalUnread(): Promise<number> {
  try {
    const channels = await listChannels();
    const counts = await Promise.all(channels.map((c) => getUnreadCount(c.id).catch(() => 0)));
    return counts.reduce((a, b) => a + b, 0);
  } catch (e) {
    err(e, 'getTotalUnread');
  }
}

// ─── User preferences (starred, muted, presence) ────────────────────
export async function getUserPreferences(): Promise<ChatUserPreferences | null> {
  try {
    const user = await currentUser();
    const { data, error } = await supabase
      .from('chat_user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return (data as ChatUserPreferences) || null;
  } catch (e) {
    err(e, 'getUserPreferences');
  }
}

async function upsertPreferences(patch: Partial<ChatUserPreferences>): Promise<ChatUserPreferences> {
  const user = await currentUser();
  const existing = await getUserPreferences();
  const base = {
    user_id: user.id,
    starred_channels: existing?.starred_channels ?? [],
    muted_channels: existing?.muted_channels ?? [],
    status: existing?.status ?? 'online',
    status_text: existing?.status_text ?? '',
    status_emoji: existing?.status_emoji ?? '',
  };
  const payload = { ...base, ...patch, updated_at: new Date().toISOString() };
  if (existing?.id) {
    const { data, error } = await supabase
      .from('chat_user_preferences')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as ChatUserPreferences;
  }
  const { data, error } = await supabase
    .from('chat_user_preferences')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as ChatUserPreferences;
}

export async function toggleStarChannel(channelId: string): Promise<ChatUserPreferences> {
  try {
    const prefs = await getUserPreferences();
    const starred = new Set(prefs?.starred_channels ?? []);
    if (starred.has(channelId)) starred.delete(channelId);
    else starred.add(channelId);
    return upsertPreferences({ starred_channels: Array.from(starred) });
  } catch (e) {
    err(e, 'toggleStarChannel');
  }
}

export async function toggleMuteChannel(channelId: string): Promise<ChatUserPreferences> {
  try {
    const prefs = await getUserPreferences();
    const muted = new Set(prefs?.muted_channels ?? []);
    if (muted.has(channelId)) muted.delete(channelId);
    else muted.add(channelId);
    return upsertPreferences({ muted_channels: Array.from(muted) });
  } catch (e) {
    err(e, 'toggleMuteChannel');
  }
}

export async function setPresence(
  status: 'online' | 'away' | 'dnd' | 'offline',
  extra: { text?: string; emoji?: string } = {}
): Promise<ChatUserPreferences> {
  try {
    return upsertPreferences({
      status,
      status_text: extra.text ?? '',
      status_emoji: extra.emoji ?? '',
    });
  } catch (e) {
    err(e, 'setPresence');
  }
}

// ─── Storage / uploads ───────────────────────────────────────────────
/**
 * Upload a local file URI (from expo-image-picker) to the `chat-files`
 * storage bucket under `chat/{userId}/{timestamp}.{ext}`. Returns a
 * ready-to-post ChatAttachment descriptor.
 *
 * Uses an ArrayBuffer body so React Native's fetch-to-Blob path doesn't
 * silently post a 0-byte file (known Supabase/Expo footgun on iOS).
 */
export async function uploadChatAttachment(
  localUri: string,
  opts: {
    filename?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    kind?: 'image' | 'file' | 'video';
  } = {}
): Promise<ChatAttachment> {
  try {
    const user = await currentUser();

    const urlPath = localUri.split('?')[0];
    const inferredName = urlPath.split('/').pop() || `image-${Date.now()}.jpg`;
    const filename = opts.filename || inferredName;
    const extFromName = filename.includes('.') ? filename.split('.').pop()! : 'jpg';
    const ext = (extFromName || 'jpg').toLowerCase();
    const mimeType =
      opts.mimeType ||
      (ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'heic' || ext === 'heif'
            ? 'image/heic'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'mp4' || ext === 'mov' || ext === 'm4v'
                ? `video/${ext === 'mov' ? 'quicktime' : 'mp4'}`
                : 'image/jpeg');

    const resp = await fetch(localUri);
    if (!resp.ok) throw new Error(`Couldn't read file (${resp.status})`);
    const arrayBuf = await resp.arrayBuffer();
    const size = arrayBuf.byteLength;

    const path = `chat/${user.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('chat-files')
      .upload(path, arrayBuf, { contentType: mimeType, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('chat-files').getPublicUrl(path);
    const fileType: ChatAttachment['file_type'] =
      opts.kind ??
      (mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'file');
    return {
      url: pub.publicUrl,
      size,
      filename,
      file_type: fileType,
      width: opts.width,
      height: opts.height,
    };
  } catch (e) {
    err(e, 'uploadChatAttachment');
  }
}

// ─── Real-time ──────────────────────────────────────────────────────
/**
 * Subscribe to INSERT events on `chat_messages` scoped to a single channel.
 * Uses a random suffix so multiple mounts (e.g. channel screen + unread
 * badge listener) can coexist without the "more than once" error.
 */
export function subscribeToChannel(
  channelId: string,
  onInsert: (msg: ChatMessage) => void
): () => void {
  const suffix = Math.random().toString(36).slice(2, 10);
  const sub = supabase
    .channel(`chat-${channelId}-${suffix}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      },
      async (payload) => {
        try {
          const { data } = await supabase
            .from('chat_messages')
            .select(MESSAGE_SELECT)
            .eq('id', (payload.new as { id: string }).id)
            .maybeSingle();
          if (data) onInsert(data as ChatMessage);
          else onInsert(payload.new as unknown as ChatMessage);
        } catch {
          onInsert(payload.new as unknown as ChatMessage);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(sub);
  };
}

/**
 * Channel-agnostic "any chat activity" subscription — for the Chat tab
 * badge. Fires on every new message the viewer can see. Caller should
 * debounce recomputation of unread counts on the fire edge.
 */
export function subscribeToAnyMessage(onInsert: () => void): () => void {
  const suffix = Math.random().toString(36).slice(2, 10);
  const sub = supabase
    .channel(`chat-any-${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      () => onInsert()
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(sub);
  };
}

// ─── Presentation helpers ──────────────────────────────────────────
/**
 * DM channels are stored with a synthetic `dm-alice-bob` slug but should
 * render as the OTHER party's name. `myUserId` lets the helper resolve
 * the counterparty when `members` is supplied; falls back to a generic
 * label otherwise.
 */
export function channelDisplayName(
  ch: ChatChannel,
  opts: {
    myUserId?: string;
    members?: { user_id: string; full_name?: string | null; email?: string | null }[];
  } = {}
): string {
  if (ch.type !== 'direct') return `#${ch.name}`;
  const other = opts.members?.find((m) => m.user_id !== opts.myUserId);
  if (other) return other.full_name || other.email?.split('@')[0] || 'Direct message';
  return ch.name?.replace(/^dm-/, '').replace(/-/g, ' ') || 'Direct message';
}

export function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/** Aggregate reactions by emoji for a single message — useful for pill rendering. */
export function groupReactions(
  reactions: ChatReaction[] | undefined,
  myUserId?: string
): { emoji: string; count: number; byMe: boolean; users: string[] }[] {
  if (!reactions?.length) return [];
  const map = new Map<string, { count: number; byMe: boolean; users: string[] }>();
  for (const r of reactions) {
    const e = map.get(r.emoji) || { count: 0, byMe: false, users: [] };
    e.count += 1;
    if (myUserId && r.user_id === myUserId) e.byMe = true;
    if (r.user_name) e.users.push(r.user_name);
    map.set(r.emoji, e);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}
