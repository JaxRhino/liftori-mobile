/**
 * appointmentsService — consulting_appointments writer (mobile).
 *
 * Rep-entered appointment creation for the /create/appointment wizard.
 * Mirrors the payload shape used by liftori/book.html so admin views pick
 * the row up the same way regardless of source. Generates its own room_id
 * with the same 3-part letter/number format the public booker uses.
 */
import { supabase } from './supabase';

// ─── Primary interests ──────────────────────────────────────────────
export type PrimaryInterest =
  | 'ai_strategy'
  | 'growth_planning'
  | 'eos_implementation'
  | 'coaching'
  | 'general';

export const PRIMARY_INTERESTS: { key: PrimaryInterest; label: string; hint: string }[] = [
  { key: 'ai_strategy',        label: 'AI Strategy',        hint: 'Automation, agents, workflow design.' },
  { key: 'growth_planning',    label: 'Growth Planning',    hint: 'Revenue, funnel, scaling the org.' },
  { key: 'eos_implementation', label: 'EOS Implementation', hint: 'Scorecards, rocks, L10s, accountability.' },
  { key: 'coaching',           label: 'Coaching',           hint: 'Leadership, ownership, performance.' },
  { key: 'general',            label: 'General',            hint: 'Not sure yet — explore fit.' },
];

// ─── Company size ───────────────────────────────────────────────────
export const COMPANY_SIZES: { key: string; label: string }[] = [
  { key: '1',     label: 'Just me' },
  { key: '2-10',  label: '2–10' },
  { key: '11-50', label: '11–50' },
  { key: '51-200',label: '51–200' },
  { key: '200+',  label: '200+' },
];

// ─── How did they hear about us ─────────────────────────────────────
export const HOW_HEARD_OPTIONS: { key: string; label: string }[] = [
  { key: 'referral',   label: 'Referral' },
  { key: 'linkedin',   label: 'LinkedIn' },
  { key: 'google',     label: 'Google' },
  { key: 'event',      label: 'Event / Meetup' },
  { key: 'podcast',    label: 'Podcast' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'direct',     label: 'Cold outreach' },
  { key: 'other',      label: 'Other' },
];

// ─── Duration (minutes) ─────────────────────────────────────────────
export const DURATION_OPTIONS: { key: number; label: string }[] = [
  { key: 15, label: '15 min' },
  { key: 30, label: '30 min' },
  { key: 45, label: '45 min' },
  { key: 60, label: '60 min' },
];

// ─── Types ──────────────────────────────────────────────────────────
export interface CreateAppointmentInput {
  /** Required — name of the lead. */
  lead_name: string;
  lead_email?: string | null;
  lead_phone?: string | null;
  company_name?: string | null;
  company_size?: string | null;
  industry?: string | null;
  primary_interest: PrimaryInterest;
  biggest_challenge?: string | null;
  how_heard?: string | null;
  /** YYYY-MM-DD */
  appointment_date: string;
  /** HH:MM or HH:MM:SS — stored as HH:MM:SS. */
  appointment_start: string;
  /** HH:MM or HH:MM:SS — stored as HH:MM:SS. */
  appointment_end: string;
  /** Optional consultant (FK → profiles.id). Left null when the rep books for "whoever is free". */
  consultant_id?: string | null;
}

export interface Appointment {
  id: string;
  slot_id: string | null;
  consultant_id: string | null;
  lead_name: string;
  lead_email: string | null;
  lead_phone: string | null;
  company_name: string | null;
  company_size: string | null;
  industry: string | null;
  primary_interest: PrimaryInterest;
  biggest_challenge: string | null;
  how_heard: string | null;
  appointment_date: string;
  appointment_start: string;
  appointment_end: string;
  room_id: string;
  status: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
/** Match book.html: 3 lowercase alphanumeric chunks, e.g. "ax8-k29-qz3". */
export function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const parts: string[] = [];
  for (let p = 0; p < 3; p++) {
    let chunk = '';
    for (let i = 0; i < 3; i++) {
      chunk += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    parts.push(chunk);
  }
  return parts.join('-');
}

/** Add a minute offset to an HH:MM string, return HH:MM:SS. */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  if (isNaN(h) || isNaN(m)) throw new Error(`Bad time: ${hhmm}`);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}:00`;
}

/** Normalize HH:MM or HH:MM:SS → HH:MM:SS. */
export function normalizeTime(t: string): string {
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  throw new Error(`Bad time: ${t}`);
}

// ─── CRUD ────────────────────────────────────────────────────────────
function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[appointmentsService] ${label}:`, e);
  throw e;
}

export async function createAppointment(
  payload: CreateAppointmentInput
): Promise<Appointment> {
  const insert = {
    slot_id: null,
    consultant_id: payload.consultant_id || null,
    lead_name: payload.lead_name,
    lead_email: payload.lead_email || null,
    lead_phone: payload.lead_phone || null,
    company_name: payload.company_name || null,
    company_size: payload.company_size || null,
    industry: payload.industry || null,
    primary_interest: payload.primary_interest,
    biggest_challenge: payload.biggest_challenge || null,
    how_heard: payload.how_heard || null,
    appointment_date: payload.appointment_date,
    appointment_start: normalizeTime(payload.appointment_start),
    appointment_end: normalizeTime(payload.appointment_end),
    room_id: generateRoomId(),
    status: 'scheduled',
  };
  const { data, error } = await supabase
    .from('consulting_appointments')
    .insert(insert)
    .select('*')
    .single();
  if (error) err(error, 'createAppointment');
  return data as Appointment;
}
