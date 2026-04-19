/**
 * calendarService — CRUD + helpers for the admin_calendar_events table.
 *
 * The DB row is flexible enough to cover all-day events (date only) and
 * timed events (date + time) on the same table — `all_day` flips between
 * the two modes. We default new events to all-day unless both a start
 * and end time are provided.
 *
 * All writes stamp `user_id = auth.uid()` so the "My calendar" view can
 * filter to the signed-in user. Admin RLS on the table allows full
 * access; the service layer just enforces the personal scope by default.
 */
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type EventColor =
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'purple'
  | 'sky'
  | 'slate'
  | string;

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  start_time: string | null; // HH:MM:SS
  end_time: string | null; // HH:MM:SS
  all_day: boolean;
  color: EventColor | null;
  project_id: string | null;
  user_id: string | null;
  created_at: string | null;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  start_date: string; // YYYY-MM-DD
  end_date?: string | null;
  start_time?: string | null; // HH:MM or HH:MM:SS
  end_time?: string | null;
  all_day?: boolean;
  color?: EventColor | null;
  project_id?: string | null;
}

export type UpdateEventInput = Partial<CreateEventInput>;

// ═══════════════════════════════════════════════════════════════════════
// Color palette
// ═══════════════════════════════════════════════════════════════════════

/**
 * The eight colors we expose in the event picker. Web admin uses the
 * same keys. Hex values match our design token colors.
 */
export const EVENT_COLORS: { key: EventColor; label: string; hex: string }[] = [
  { key: 'blue', label: 'Blue', hex: '#0ea5e9' },
  { key: 'emerald', label: 'Emerald', hex: '#10b981' },
  { key: 'amber', label: 'Amber', hex: '#f59e0b' },
  { key: 'rose', label: 'Rose', hex: '#f43f5e' },
  { key: 'purple', label: 'Purple', hex: '#a855f7' },
  { key: 'sky', label: 'Sky', hex: '#38bdf8' },
  { key: 'slate', label: 'Slate', hex: '#64748b' },
];

export function eventColorHex(color: EventColor | null | undefined): string {
  if (!color) return '#0ea5e9';
  const hit = EVENT_COLORS.find((c) => c.key === color);
  return hit ? hit.hex : '#0ea5e9';
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const SELECT_FIELDS =
  'id, title, description, start_date, end_date, start_time, end_time, all_day, color, project_id, user_id, created_at';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

function fail(e: unknown, where: string): never {
  const msg = e instanceof Error ? e.message : String(e);
  throw new Error(`${where}: ${msg}`);
}

/** Normalize HH:MM → HH:MM:SS (postgres `time` column). */
function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t; // Let DB error on unexpected shapes rather than swallow silently
}

/** Return `YYYY-MM-DD` from a Date using the device's local clock. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` into a local-midnight Date (avoids UTC drift). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Get the first day of the month for a given date key. */
export function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Get the last day of the month for a given date key. */
export function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** e.g. "April 2026" */
export function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** 6×7 calendar grid keys (leading/trailing days included). */
export function buildMonthGrid(month: Date): string[] {
  const first = firstOfMonth(month);
  const startDow = first.getDay(); // 0 = Sunday
  const grid: string[] = [];
  const start = new Date(first);
  start.setDate(1 - startDow);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    grid.push(toDateKey(d));
  }
  return grid;
}

/** "9:00 AM" from HH:MM:SS. */
export function formatTimeLabel(hhmmss: string | null): string {
  if (!hhmmss) return '';
  const [h, m] = hhmmss.split(':').map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return '';
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Mon, Apr 20" */
export function formatDayLabel(key: string): string {
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════

/**
 * List calendar events that overlap the given `[rangeStart, rangeEnd]`
 * window (inclusive, YYYY-MM-DD). Filters to the current user by
 * default — pass `ownerId: null` to see everyone's events.
 */
export async function listEventsInRange(opts: {
  rangeStart: string;
  rangeEnd: string;
  ownerId?: string | null;
  limit?: number;
}): Promise<CalendarEvent[]> {
  try {
    const { rangeStart, rangeEnd, limit } = opts;
    const ownerId =
      opts.ownerId === null ? null : opts.ownerId ?? (await currentUserId());

    // We want any event whose [start_date, coalesce(end_date,start_date)]
    // overlaps [rangeStart, rangeEnd]. Postgres filter:
    //   start_date <= rangeEnd AND coalesce(end_date, start_date) >= rangeStart
    // We fetch with a simpler start_date window (sufficient for single-day
    // events — multi-day are rare) then filter client-side for correctness.
    let query = supabase
      .from('admin_calendar_events')
      .select(SELECT_FIELDS)
      .lte('start_date', rangeEnd)
      .gte('start_date', rangeStart) // fast path
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: true })
      .limit(limit ?? 500);
    if (ownerId) query = query.eq('user_id', ownerId);

    const { data, error } = await query;
    if (error) throw error;

    // Fallback: also pull any multi-day event whose end_date lands in-range
    // but whose start_date is before rangeStart. These are uncommon, so a
    // second query keeps the fast path lean.
    let tail: CalendarEvent[] = [];
    let tailQuery = supabase
      .from('admin_calendar_events')
      .select(SELECT_FIELDS)
      .lt('start_date', rangeStart)
      .gte('end_date', rangeStart)
      .order('start_date', { ascending: true })
      .limit(100);
    if (ownerId) tailQuery = tailQuery.eq('user_id', ownerId);
    const tailRes = await tailQuery;
    if (!tailRes.error) tail = (tailRes.data as CalendarEvent[]) ?? [];

    const all = [...(data as CalendarEvent[] ?? []), ...tail];
    // De-dup by id (tail overlap is possible if DB returns the same row)
    const seen = new Set<string>();
    const unique = all.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    return unique;
  } catch (e) {
    fail(e, 'listEventsInRange');
  }
}

/**
 * List events for a single day. Convenience wrapper around
 * listEventsInRange for the day-view agenda list.
 */
export async function listEventsForDay(
  dateKey: string,
  ownerId?: string | null
): Promise<CalendarEvent[]> {
  return listEventsInRange({
    rangeStart: dateKey,
    rangeEnd: dateKey,
    ownerId,
  });
}

/**
 * List upcoming events from today forward. Used for "what's coming up"
 * agenda summaries (e.g., the home screen widget).
 */
export async function listUpcomingEvents(opts: {
  ownerId?: string | null;
  limit?: number;
  days?: number; // how far out to look, default 30
} = {}): Promise<CalendarEvent[]> {
  const today = toDateKey(new Date());
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + (opts.days ?? 30));
  return listEventsInRange({
    rangeStart: today,
    rangeEnd: toDateKey(horizon),
    ownerId: opts.ownerId,
    limit: opts.limit ?? 20,
  });
}

export async function fetchEvent(id: string): Promise<CalendarEvent | null> {
  try {
    const { data, error } = await supabase
      .from('admin_calendar_events')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as CalendarEvent) ?? null;
  } catch (e) {
    fail(e, 'fetchEvent');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════════

export async function createEvent(
  payload: CreateEventInput
): Promise<CalendarEvent> {
  try {
    const userId = await currentUserId();

    const startTime = normalizeTime(payload.start_time ?? null);
    const endTime = normalizeTime(payload.end_time ?? null);
    // If both times are present, it's a timed event; else default to all-day
    const allDay =
      payload.all_day ?? (!(startTime && endTime));

    const insert = {
      title: payload.title.trim() || 'Untitled event',
      description: payload.description?.trim() || null,
      start_date: payload.start_date,
      end_date: payload.end_date || null,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
      all_day: allDay,
      color: payload.color || 'blue',
      project_id: payload.project_id || null,
      user_id: userId,
    };

    const { data, error } = await supabase
      .from('admin_calendar_events')
      .insert(insert)
      .select(SELECT_FIELDS)
      .single();
    if (error) throw error;
    return data as CalendarEvent;
  } catch (e) {
    fail(e, 'createEvent');
  }
}

export async function updateEvent(
  id: string,
  fields: UpdateEventInput
): Promise<CalendarEvent> {
  try {
    const userId = await currentUserId();
    const patch: Record<string, unknown> = {};
    if (fields.title !== undefined) patch.title = fields.title.trim() || 'Untitled event';
    if (fields.description !== undefined)
      patch.description = fields.description?.trim() || null;
    if (fields.start_date !== undefined) patch.start_date = fields.start_date;
    if (fields.end_date !== undefined) patch.end_date = fields.end_date || null;
    if (fields.start_time !== undefined)
      patch.start_time = normalizeTime(fields.start_time);
    if (fields.end_time !== undefined)
      patch.end_time = normalizeTime(fields.end_time);
    if (fields.all_day !== undefined) patch.all_day = fields.all_day;
    if (fields.color !== undefined) patch.color = fields.color || 'blue';
    if (fields.project_id !== undefined)
      patch.project_id = fields.project_id || null;

    const { data, error } = await supabase
      .from('admin_calendar_events')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Event not found or not yours to edit');
    return data as CalendarEvent;
  } catch (e) {
    fail(e, 'updateEvent');
  }
}

export async function deleteEvent(id: string): Promise<void> {
  try {
    const userId = await currentUserId();
    const { error } = await supabase
      .from('admin_calendar_events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (e) {
    fail(e, 'deleteEvent');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Aggregations
// ═══════════════════════════════════════════════════════════════════════

/**
 * Group a flat event list by date key, expanding multi-day events to
 * every day they span. Handy for the month-grid "dots" and the agenda
 * list.
 */
export function groupEventsByDate(
  events: CalendarEvent[]
): Record<string, CalendarEvent[]> {
  const out: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    const start = parseDateKey(e.start_date);
    const end = e.end_date ? parseDateKey(e.end_date) : start;
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = toDateKey(cursor);
      if (!out[key]) out[key] = [];
      out[key].push(e);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return out;
}
