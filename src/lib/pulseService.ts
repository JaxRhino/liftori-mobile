/**
 * pulseService — Liftori's team time-clock (mobile).
 *
 * Mirror of liftori-admin/src/lib/pulseService.js. Only the RPCs and formatters
 * that make sense on a phone — no CSV export helpers, no DOM downloads.
 *
 * Backed by:
 *   work_sessions            — one row per clock-in session
 *   pulse_adjustments        — audit log
 *   RPC start_session()      — idempotent clock-in
 *   RPC end_session(reason)  — idempotent clock-out
 *   RPC pulse_heartbeat()    — bumps updated_at on open session
 *   View v_pulse_all_time    — ttd_seconds per user (for tier badge)
 */
import { supabase } from './supabase';

// ─── Tier catalog (mirror of desktop) ────────────────────────────────
export type PulseTierKey = 'rookie' | 'regular' | 'operator' | 'vet' | 'legend';

export interface PulseTier {
  key: PulseTierKey;
  label: string;
  minHours: number;
  color: string;
  hint: string;
}

export const PULSE_TIERS: PulseTier[] = [
  { key: 'rookie',   label: 'Rookie',   minHours:    0, color: '#64748b', hint: 'Just getting started' },
  { key: 'regular',  label: 'Regular',  minHours:   40, color: '#0ea5e9', hint: 'Putting in the hours' },
  { key: 'operator', label: 'Operator', minHours:  200, color: '#10b981', hint: 'Real contributor' },
  { key: 'vet',      label: 'Vet',      minHours:  500, color: '#f59e0b', hint: 'Battle-tested' },
  { key: 'legend',   label: 'Legend',   minHours: 1000, color: '#f43f5e', hint: 'Carrying the team' },
];

export function tierFor(ttdSeconds: number | null | undefined): PulseTier {
  const hours = (ttdSeconds || 0) / 3600;
  return [...PULSE_TIERS].reverse().find((t) => hours >= t.minHours) || PULSE_TIERS[0];
}

// ─── Types ───────────────────────────────────────────────────────────
export interface WorkSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  source: string | null;
  is_offline: boolean;
  ended_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Formatters ──────────────────────────────────────────────────────
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatHours(seconds: number): string {
  return `${((seconds || 0) / 3600).toFixed(1)}h`;
}

// ─── RPCs ────────────────────────────────────────────────────────────
export async function startSession(): Promise<WorkSession | null> {
  const { data, error } = await supabase.rpc('start_session');
  if (error) throw error;
  return (data as WorkSession) || null;
}

export async function endSession(reason: string = 'manual'): Promise<WorkSession | null> {
  const { data, error } = await supabase.rpc('end_session', { p_reason: reason });
  if (error) throw error;
  return (data as WorkSession) || null;
}

export async function getMyOpenSession(): Promise<WorkSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('work_sessions')
    .select('*')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkSession) || null;
}

export async function heartbeat(): Promise<void> {
  try {
    await supabase.rpc('pulse_heartbeat');
  } catch (err) {
    // Non-fatal — idle reaper tolerates misses
    // eslint-disable-next-line no-console
    console.warn('[pulse] heartbeat failed:', err);
  }
}

// ─── Reads ───────────────────────────────────────────────────────────
export interface AllTimeRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  title: string | null;
  ttd_seconds: number;
  tier: string | null;
}

export async function fetchAllTimeRow(userId: string): Promise<AllTimeRow | null> {
  const { data, error } = await supabase
    .from('v_pulse_all_time')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as AllTimeRow) || null;
}
