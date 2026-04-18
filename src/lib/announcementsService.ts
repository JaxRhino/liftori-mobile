/**
 * announcementsService — Liftori's platform announcements (mobile).
 *
 * Mirror of liftori-admin/src/lib/announcementsService.js. Read paths go
 * through the `get_active_announcements_for_me` RPC so audience targeting,
 * expiry, ack filtering, and customer-exclusion are enforced server-side.
 * Write path is an idempotent insert into `announcement_acknowledgments`.
 *
 * The client is a pure receiver — it doesn't and shouldn't duplicate any
 * of the audience logic that lives in the RPC + RLS.
 */
import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────

export type Template =
  | 'new_hire'
  | 'feature_launch'
  | 'company_update'
  | 'pump_up'
  | 'custom';

export type AudienceType = 'all_team' | 'department' | 'individual';

export type Priority = 'normal' | 'important' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  template: Template;
  audience_type: AudienceType;
  audience_departments: string[] | null;
  audience_user_ids: string[] | null;
  priority: Priority;
  accent_color: string;
  icon: string | null;
  posted_by: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[announcementsService] ${label}:`, e);
  throw e;
}

const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  important: 1,
  normal: 2,
};

/**
 * Stable sort: priority asc (urgent first), created_at desc.
 */
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 3;
    const pb = PRIORITY_RANK[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

// ─── Read ───────────────────────────────────────────────────────────

/**
 * Returns announcements the current user hasn't acked yet and is in the
 * target audience of. Filter logic is entirely server-side.
 */
export async function fetchActiveForMe(): Promise<Announcement[]> {
  try {
    const { data, error } = await supabase.rpc('get_active_announcements_for_me');
    if (error) throw error;
    return sortAnnouncements((data as Announcement[]) || []);
  } catch (e) {
    err(e, 'fetchActiveForMe');
  }
}

// ─── Write ──────────────────────────────────────────────────────────

/**
 * Idempotent — the unique (announcement_id, user_id) constraint protects
 * against double-acks. We swallow the 23505 unique-violation because a
 * re-ack is a no-op as far as the user is concerned.
 */
export async function acknowledgeAnnouncement(
  announcementId: string,
  userId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('announcement_acknowledgments')
      .insert({ announcement_id: announcementId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } catch (e) {
    err(e, 'acknowledgeAnnouncement');
  }
}
