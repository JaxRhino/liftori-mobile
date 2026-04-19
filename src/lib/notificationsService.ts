/**
 * notificationsService — Liftori's in-app notifications (mobile).
 *
 * Mirror of the desktop `NotificationBell.jsx` reads. The `notifications`
 * table stores per-user rows with { type, title, body, link, read }. The
 * desktop bell subscribes via Realtime for INSERTs; on mobile we expose
 * the same subscription as a helper so the More tab can show an unread
 * badge and the inbox screen can prepend new rows without a refetch.
 *
 * RLS on `notifications`: users can SELECT / UPDATE their own rows.
 * Writes (INSERT) are done server-side (edge functions / RLS-bypassing
 * service role) — this client never creates notifications.
 */
import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────

export type NotificationType =
  | 'ticket'
  | 'ticket_reply'
  | 'message'
  | 'project_update'
  | 'general'
  | string; // allow forward-compat

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[notificationsService] ${label}:`, e);
  throw e;
}

// ─── Read ───────────────────────────────────────────────────────────

/**
 * Most recent `limit` notifications for the signed-in user. RLS scopes
 * the rows, so no extra filter on `user_id` is strictly required — but
 * we pass it explicitly so a stale session can't surprise us.
 */
export async function fetchNotifications(
  userId: string,
  limit = 30,
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Notification[]) || [];
  } catch (e) {
    err(e, 'fetchNotifications');
  }
}

/**
 * Lightweight unread count — used by the More tab badge. Uses a HEAD
 * request with count so we don't pull rows we won't render.
 */
export async function fetchUnreadCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    err(e, 'fetchUnreadCount');
  }
}

// ─── Write ──────────────────────────────────────────────────────────

export async function markAsRead(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'markAsRead');
  }
}

/**
 * Mark every unread row for the user as read. Bulk UPDATE is faster than
 * N round-trips and leaves the DB consistent even if the client crashes
 * mid-sweep.
 */
export async function markAllRead(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw error;
  } catch (e) {
    err(e, 'markAllRead');
  }
}

// ─── Realtime ───────────────────────────────────────────────────────

/**
 * Subscribe to INSERTs on `notifications` scoped to the signed-in user.
 * Returns an unsubscribe function. Call once per mount and clean up on
 * unmount or when the user id changes.
 *
 * The caller decides whether to prepend the row to local state, play a
 * sound, show a toast, or all three — the service is a pure transport.
 */
export function subscribeToNotifications(
  userId: string,
  onInsert: (n: Notification) => void,
): () => void {
  // IMPORTANT: the channel name MUST be unique per subscription. Supabase
  // Realtime v2 will reject `.on('postgres_changes', …)` with
  //   "tried to add postgres_changes callbacks to topic … more than once"
  // if two screens (e.g. the More tab badge + the Notifications inbox)
  // both create a channel with the same name. Appending a short random
  // suffix gives every mount its own topic so both can coexist.
  const suffix = Math.random().toString(36).slice(2, 10);
  const channel = supabase
    .channel(`notifications-${userId}-${suffix}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload: { new: Notification }) => {
        onInsert(payload.new);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ─── UI helpers ─────────────────────────────────────────────────────

/**
 * Human-readable "X ago" for list rows. Kept here so the inbox and any
 * future dropdown render identical strings.
 */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
