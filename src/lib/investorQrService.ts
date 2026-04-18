/**
 * investorQrService — "My Investor QR" (Wave 14).
 *
 * Every team member gets a second QR code — `/invest/:handle` — that
 * points prospective investors at a Liftori pitch landing page + founder
 * call booker. Attribution runs back to the rep who introduced the
 * investor.
 *
 * Backed by:
 *   profiles.rep_handle               — shared with "My QR" (meet flow)
 *   investor_leads                    — inbound investor submissions
 *   investor_qr_scans                 — event log (logged by landing page)
 *   RPC my_investor_qr_stats(rep_id)  — scans/leads/booked/committed $
 *   RPC submit_investor_lead(...)     — called from the public page, not here
 */
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────
export interface InvestorQrStats {
  scans_7d: number;
  scans_all: number;
  leads_30d: number;
  leads_all: number;
  booked_30d: number;
  committed_cents_all: number;
}

/**
 * Base URL for the public /invest/:handle investor landing page.
 */
export const INVEST_BASE_URL = 'https://liftori.ai/invest';

/**
 * Build the investor URL for a given rep_handle. Returns null if no handle.
 */
export function investUrlForHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return `${INVEST_BASE_URL}/${handle}`;
}

// ─── Reads ───────────────────────────────────────────────────────────
export async function getMyInvestorQrStats(userId: string): Promise<InvestorQrStats> {
  const { data, error } = await supabase.rpc('my_investor_qr_stats', { p_rep_id: userId });
  if (error) throw error;
  const stats = (data ?? {}) as Partial<InvestorQrStats>;
  return {
    scans_7d: stats.scans_7d ?? 0,
    scans_all: stats.scans_all ?? 0,
    leads_30d: stats.leads_30d ?? 0,
    leads_all: stats.leads_all ?? 0,
    booked_30d: stats.booked_30d ?? 0,
    committed_cents_all: stats.committed_cents_all ?? 0,
  };
}

// ─── Formatters ──────────────────────────────────────────────────────
/**
 * Format committed investor dollars. Larger thresholds than consulting
 * revenue — an investor check of $25K should read "$25K", not rounded.
 */
export function formatCommitted(cents: number): string {
  if (!cents) return '$0';
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}K`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${Math.round(dollars)}`;
}
