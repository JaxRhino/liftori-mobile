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

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  edited_at: string | null;
  created_at: string;
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
  content: string
): Promise<ChatMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message is empty');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ channel_id: channelId, sender_id: user.id, content: trimmed })
    .select(
      '*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, email, avatar_url)'
    )
    .single();
  if (error) throw error;
  return data as ChatMessage;
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
