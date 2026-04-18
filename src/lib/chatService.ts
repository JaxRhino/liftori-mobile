/**
 * chatService — Liftori's Slack-style chat backend helpers (mobile).
 *
 * Backed by:
 *   chat_channels   — internal team channels + client DM channels
 *   chat_messages   — messages (with real-time subscriptions)
 *
 * The mobile experience is intentionally smaller than the desktop app —
 *   • No channel creation (admins create channels on desktop)
 *   • No threads / pinned messages / reactions (v2)
 *   • Internal + DM channels both surface in one flat list
 *
 * What we DO support: listing channels, fetching messages, sending, real-time
 * subscription to inserts.
 */
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────
export interface ChatChannel {
  id: string;
  name: string;
  description: string | null;
  channel_type: 'internal' | 'client_dm';
  project_id: string | null;
  customer_id: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
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
  file_type: 'image' | 'file';
  /** Optional — populated when uploader knows the dimensions. */
  width?: number;
  height?: number;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  edited_at: string | null;
  created_at: string;
  attachments?: ChatAttachment[] | null;
  /** joined profile — nullable because older rows may not resolve. */
  sender?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

// ─── Reads ───────────────────────────────────────────────────────────
export async function listChannels(): Promise<ChatChannel[]> {
  const { data, error } = await supabase
    .from('chat_channels')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChatChannel[]) || [];
}

export async function getChannel(channelId: string): Promise<ChatChannel | null> {
  const { data, error } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('id', channelId)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatChannel) || null;
}

export async function listMessages(
  channelId: string,
  { limit = 50 }: { limit?: number } = {}
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      '*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, email, avatar_url)'
    )
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  // Return oldest-first for render convenience
  return ((data as ChatMessage[]) || []).slice().reverse();
}

export async function getLastMessage(channelId: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatMessage) || null;
}

// ─── Writes ──────────────────────────────────────────────────────────
export async function sendMessage(
  channelId: string,
  content: string,
  attachments?: ChatAttachment[] | null
): Promise<ChatMessage> {
  const trimmed = content.trim();
  const hasAttachments = !!attachments && attachments.length > 0;
  if (!trimmed && !hasAttachments) throw new Error('Message is empty');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // The DB column has NOT NULL on content, so use a thin placeholder
  // when we're sending a pure-attachment message (matches admin web behavior).
  const body =
    trimmed || (hasAttachments ? (attachments![0].file_type === 'image' ? '📷' : '📎') : '');

  // chat_messages also requires sender_name NOT NULL — grab the profile
  // to stamp it alongside sender_id.
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url, role')
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
      content: body,
      attachments: hasAttachments ? attachments : null,
    })
    .select(
      '*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, email, avatar_url)'
    )
    .single();
  if (error) throw error;
  return data as ChatMessage;
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
  opts: { filename?: string; mimeType?: string; width?: number; height?: number } = {}
): Promise<ChatAttachment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // Derive filename + extension
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
            : 'image/jpeg');

  // Read the local file as an ArrayBuffer for Supabase JS.
  const resp = await fetch(localUri);
  if (!resp.ok) throw new Error(`Couldn't read image (${resp.status})`);
  const arrayBuf = await resp.arrayBuffer();
  const size = arrayBuf.byteLength;

  const path = `chat/${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('chat-files')
    .upload(path, arrayBuf, {
      contentType: mimeType,
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from('chat-files').getPublicUrl(path);
  return {
    url: pub.publicUrl,
    size,
    filename,
    file_type: mimeType.startsWith('image/') ? 'image' : 'file',
    width: opts.width,
    height: opts.height,
  };
}

// ─── Real-time ──────────────────────────────────────────────────────
export function subscribeToChannel(
  channelId: string,
  onInsert: (msg: ChatMessage) => void
): () => void {
  const sub = supabase
    .channel(`chat-${channelId}`)
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
          // Re-fetch with join so the sender profile is populated
          const { data } = await supabase
            .from('chat_messages')
            .select(
              '*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, email, avatar_url)'
            )
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

// ─── Presentation helpers ──────────────────────────────────────────
export function channelDisplayName(ch: ChatChannel): string {
  if (ch.channel_type === 'client_dm') return ch.name || 'Client DM';
  return `#${ch.name}`;
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
