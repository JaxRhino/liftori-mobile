/**
 * hiringQrService — "My Hiring QR" (Wave 15).
 *
 * Third QR surface for every team member. Encodes:
 *
 *   https://liftori.ai/apply/<rep_handle>
 *
 * Shown on job boards, flyers, referral cards, "we're hiring" posts.
 * Lands prospective applicants on a public careers application page
 * that's pre-attributed to the rep who shared the QR. Any hire made
 * through this link gets tied to the referrer for the 5% / 90-day
 * referral bonus (hiring_referrals table).
 *
 * The rep_handle is SHARED with /meet (networking) and /invest
 * (investor nest). One handle → three QR surfaces. If the user
 * hasn't claimed a handle yet, this screen routes them to /my-qr.
 *
 * Backed by:
 *   profiles.rep_handle              — shared with /meet + /invest flows
 *   hiring_referrals                 — referral attribution + bonus terms
 *   applicants (referred_by)         — inbound applications tied to rep
 *   RPC my_hiring_qr_stats(rep_id)   — referrals/interviews/hires counts
 *   RPC resolve_hiring_handle(h)     — public resolver (used by /apply page)
 *   RPC submit_application(...)      — called from public page, not here
 */
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────
export interface HiringQrStats {
  referrals_7d: number;
  referrals_all: number;
  interviews_all: number;
  hired_all: number;
}

/**
 * Base URL for the public /apply/:handle careers landing page.
 */
export const APPLY_BASE_URL = 'https://liftori.ai/apply';

/**
 * Build the apply URL for a given rep_handle. Returns null if no handle.
 */
export function applyUrlForHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return `${APPLY_BASE_URL}/${handle}`;
}

// ─── Reads ───────────────────────────────────────────────────────────
export async function getMyHiringQrStats(userId: string): Promise<HiringQrStats> {
  const { data, error } = await supabase.rpc('my_hiring_qr_stats', { p_rep_id: userId });
  if (error) throw error;
  const stats = (data ?? {}) as Partial<HiringQrStats>;
  return {
    referrals_7d: stats.referrals_7d ?? 0,
    referrals_all: stats.referrals_all ?? 0,
    interviews_all: stats.interviews_all ?? 0,
    hired_all: stats.hired_all ?? 0,
  };
}
