/**
 * qrService — "My QR" networking feature (mobile).
 *
 * Each Liftori team member has a unique `rep_handle` on their profile.
 * When they show their QR out in the field, it opens:
 *
 *   https://liftori.ai/meet/<rep_handle>
 *
 * …which logs a scan, captures a lead, and attributes it back to the
 * rep so they get credit. This service is the read/write surface for the
 * rep's own handle + stats.
 *
 * Backed by:
 *   profiles.rep_handle          — unique, case-insensitive
 *   meet_qr_scans                — event log (server-side scan logging
 *                                  happens on the /meet page, not here)
 *   RPC my_qr_stats(rep_id)      — returns scans_7d/all, leads_30d/all,
 *                                  booked_30d, revenue_all_cents
 *   RPC resolve_rep_handle(h)    — public resolver (used by /meet page)
 */
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────
export interface QrStats {
  scans_7d: number;
  scans_all: number;
  leads_30d: number;
  leads_all: number;
  booked_30d: number;
  revenue_all_cents: number;
}

export interface RepHandleInfo {
  handle: string | null;
  meetUrl: string | null;
}

/**
 * Base URL for the public /meet/:handle landing page. Kept here (not
 * hard-coded in the screen) so staging/preview builds can override it.
 */
export const MEET_BASE_URL = 'https://liftori.ai/meet';

// ─── Reads ───────────────────────────────────────────────────────────
export async function getMyHandle(userId: string): Promise<RepHandleInfo> {
  const { data, error } = await supabase
    .from('profiles')
    .select('rep_handle')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const handle = (data?.rep_handle as string | null) || null;
  return {
    handle,
    meetUrl: handle ? `${MEET_BASE_URL}/${handle}` : null,
  };
}

export async function getMyQrStats(userId: string): Promise<QrStats> {
  const { data, error } = await supabase.rpc('my_qr_stats', { p_rep_id: userId });
  if (error) throw error;
  // RPC returns a json blob — defensively coerce shape
  const stats = (data ?? {}) as Partial<QrStats>;
  return {
    scans_7d: stats.scans_7d ?? 0,
    scans_all: stats.scans_all ?? 0,
    leads_30d: stats.leads_30d ?? 0,
    leads_all: stats.leads_all ?? 0,
    booked_30d: stats.booked_30d ?? 0,
    revenue_all_cents: stats.revenue_all_cents ?? 0,
  };
}

// ─── Writes ──────────────────────────────────────────────────────────
/**
 * Validate a handle client-side before attempting to claim it. Rules:
 *   • 3–24 chars
 *   • [a-z0-9_-]
 *   • must start with a letter
 * Case-insensitivity is enforced server-side by the unique index.
 */
export function validateHandle(raw: string): { ok: true; handle: string } | { ok: false; reason: string } {
  const handle = raw.trim().toLowerCase();
  if (handle.length < 3) return { ok: false, reason: 'At least 3 characters.' };
  if (handle.length > 24) return { ok: false, reason: 'Max 24 characters.' };
  if (!/^[a-z][a-z0-9_-]*$/.test(handle)) {
    return { ok: false, reason: 'Letters, numbers, - and _ only. Must start with a letter.' };
  }
  return { ok: true, handle };
}

/**
 * Claim or change your rep_handle. The unique index is case-insensitive,
 * so we pre-normalize to lowercase before writing.
 */
export async function setMyHandle(userId: string, rawHandle: string): Promise<RepHandleInfo> {
  const v = validateHandle(rawHandle);
  if (!v.ok) throw new Error(v.reason);

  const { error } = await supabase
    .from('profiles')
    .update({ rep_handle: v.handle })
    .eq('id', userId);
  if (error) {
    // Postgres 23505 = unique violation → handle already taken
    if ((error as { code?: string }).code === '23505') {
      throw new Error('That handle is taken. Try another.');
    }
    throw error;
  }
  return { handle: v.handle, meetUrl: `${MEET_BASE_URL}/${v.handle}` };
}

// ─── Formatters ──────────────────────────────────────────────────────
export function formatRevenue(cents: number): string {
  if (!cents) return '$0';
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars)}`;
}
