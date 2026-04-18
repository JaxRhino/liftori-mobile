/**
 * useClock — mobile hook for the Pulse time-clock.
 *
 * Single source of truth for "am I clocked in, and for how long?"
 * Used by the Home tab ClockChip, the More tab profile, etc.
 *
 * Behavior:
 *   • On mount, loads the current user's open session (if any).
 *   • While clocked in, ticks every second to update the running display.
 *   • While clocked in, sends a background heartbeat every 30 seconds so the
 *     idle reaper doesn't kill us.
 *   • `clockIn` and `clockOut` are idempotent — safe to tap twice in a row.
 *   • Haptics: bump on clock in, success on clock out, error on failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as haptics from './haptics';
import {
  WorkSession,
  endSession,
  getMyOpenSession,
  heartbeat,
  startSession,
} from './pulseService';

const HEARTBEAT_MS = 30 * 1000;

function secondsSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  const diff = (Date.now() - then) / 1000;
  return diff > 0 ? Math.floor(diff) : 0;
}

export interface UseClockResult {
  /** Currently open session, or null if clocked out. */
  session: WorkSession | null;
  /** Seconds elapsed on the currently open session (ticks every 1s). */
  elapsed: number;
  /** True while initial load is in flight. */
  loading: boolean;
  /** True if the user is currently clocked in. */
  isRunning: boolean;
  /** Clock in. No-op if already clocked in. */
  clockIn: () => Promise<void>;
  /** Clock out. No-op if not clocked in. */
  clockOut: (reason?: string) => Promise<void>;
  /** Manually re-sync from the server (e.g., after a screen focus). */
  refresh: () => Promise<void>;
  /** Last error message, if any. */
  error: string | null;
}

export function useClock(): UseClockResult {
  const [session, setSession] = useState<WorkSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Load open session ────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const s = await getMyOpenSession();
      setSession(s);
      setElapsed(s ? secondsSince(s.started_at) : 0);
      setError(null);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[useClock] refresh failed:', e?.message);
      setError(e?.message || 'Failed to load clock state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Re-sync on app foreground ────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // ─── Running timers ───────────────────────────────────────────────
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (beatRef.current) clearInterval(beatRef.current);
    if (!session) return;

    // 1-second tick for display
    tickRef.current = setInterval(() => {
      setElapsed(secondsSince(session.started_at));
    }, 1000);

    // 30-second heartbeat so the idle reaper leaves us alone
    beatRef.current = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (beatRef.current) clearInterval(beatRef.current);
    };
  }, [session]);

  // ─── Actions ──────────────────────────────────────────────────────
  const clockIn = useCallback(async () => {
    if (session) return;
    try {
      const s = await startSession();
      if (s) {
        setSession(s);
        setElapsed(secondsSince(s.started_at));
        haptics.bump();
      }
      setError(null);
    } catch (e: any) {
      haptics.error();
      setError(e?.message || 'Clock-in failed');
    }
  }, [session]);

  const clockOut = useCallback(
    async (reason: string = 'manual') => {
      if (!session) return;
      try {
        await endSession(reason);
        setSession(null);
        setElapsed(0);
        haptics.success();
        setError(null);
      } catch (e: any) {
        haptics.error();
        setError(e?.message || 'Clock-out failed');
      }
    },
    [session]
  );

  return {
    session,
    elapsed,
    loading,
    isRunning: Boolean(session),
    clockIn,
    clockOut,
    refresh,
    error,
  };
}
