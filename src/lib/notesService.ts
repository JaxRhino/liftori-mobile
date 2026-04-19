/**
 * notesService — CRUD + helpers for the admin_notes table.
 *
 * Notes are a flat list with:
 *   - title, body
 *   - tags[] (array of strings, searchable)
 *   - pinned (boolean; pinned-first sort)
 *   - color (palette key; matches sticky-note vibes)
 *
 * Sort order across the app:
 *   pinned desc → updated_at desc
 *
 * All writes stamp `user_id = auth.uid()` so "My notes" stays scoped.
 */
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type NoteColor =
  | 'default'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'sky'
  | 'purple'
  | 'slate'
  | string;

export interface AdminNote {
  id: string;
  title: string;
  body: string | null;
  tags: string[];
  pinned: boolean;
  color: NoteColor | null;
  user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateNoteInput {
  title?: string;
  body?: string | null;
  tags?: string[];
  pinned?: boolean;
  color?: NoteColor;
}

export type UpdateNoteInput = Partial<CreateNoteInput>;

export interface NoteFilter {
  ownerId?: string | null;
  search?: string;
  pinnedOnly?: boolean;
  tag?: string;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Color palette — maps to the UI sticky-note backgrounds
// ═══════════════════════════════════════════════════════════════════════

export const NOTE_COLORS: {
  key: NoteColor;
  label: string;
  surface: string;
  accent: string;
}[] = [
  { key: 'default', label: 'Slate', surface: '#1e293b', accent: '#94a3b8' },
  { key: 'amber', label: 'Amber', surface: '#3b2a0a', accent: '#f59e0b' },
  { key: 'emerald', label: 'Emerald', surface: '#0b2a20', accent: '#10b981' },
  { key: 'rose', label: 'Rose', surface: '#331623', accent: '#f43f5e' },
  { key: 'sky', label: 'Sky', surface: '#0d2939', accent: '#0ea5e9' },
  { key: 'purple', label: 'Purple', surface: '#2a1440', accent: '#a855f7' },
  { key: 'slate', label: 'Dark', surface: '#111827', accent: '#64748b' },
];

export function noteColorMeta(color: NoteColor | null | undefined): {
  surface: string;
  accent: string;
} {
  const hit = NOTE_COLORS.find((c) => c.key === (color || 'default'));
  return {
    surface: hit?.surface ?? NOTE_COLORS[0].surface,
    accent: hit?.accent ?? NOTE_COLORS[0].accent,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const SELECT_FIELDS =
  'id, title, body, tags, pinned, color, user_id, created_at, updated_at';

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

function normalizeTags(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  const out = new Set<string>();
  for (const t of tags) {
    const clean = t.trim().toLowerCase();
    if (clean) out.add(clean);
  }
  return Array.from(out);
}

// ═══════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════

export async function listNotes(filter: NoteFilter = {}): Promise<AdminNote[]> {
  try {
    const ownerId =
      filter.ownerId === null
        ? null
        : filter.ownerId ?? (await currentUserId());

    let query = supabase
      .from('admin_notes')
      .select(SELECT_FIELDS)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(filter.limit ?? 200);

    if (ownerId) query = query.eq('user_id', ownerId);
    if (filter.pinnedOnly) query = query.eq('pinned', true);
    if (filter.tag) query = query.contains('tags', [filter.tag.toLowerCase()]);
    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim().replace(/[%,]/g, '');
      query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return ((data as AdminNote[]) ?? []).map((n) => ({
      ...n,
      tags: Array.isArray(n.tags) ? n.tags : [],
    }));
  } catch (e) {
    fail(e, 'listNotes');
  }
}

export async function fetchNote(id: string): Promise<AdminNote | null> {
  try {
    const { data, error } = await supabase
      .from('admin_notes')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const n = data as AdminNote;
    return { ...n, tags: Array.isArray(n.tags) ? n.tags : [] };
  } catch (e) {
    fail(e, 'fetchNote');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════════

export async function createNote(
  payload: CreateNoteInput = {}
): Promise<AdminNote> {
  try {
    const userId = await currentUserId();
    const insert = {
      title: payload.title?.trim() || 'Untitled',
      body: payload.body?.trim() || null,
      tags: normalizeTags(payload.tags),
      pinned: payload.pinned ?? false,
      color: payload.color || 'default',
      user_id: userId,
    };
    const { data, error } = await supabase
      .from('admin_notes')
      .insert(insert)
      .select(SELECT_FIELDS)
      .single();
    if (error) throw error;
    return data as AdminNote;
  } catch (e) {
    fail(e, 'createNote');
  }
}

export async function updateNote(
  id: string,
  fields: UpdateNoteInput
): Promise<AdminNote> {
  try {
    const userId = await currentUserId();
    const patch: Record<string, unknown> = {};
    if (fields.title !== undefined)
      patch.title = fields.title.trim() || 'Untitled';
    if (fields.body !== undefined) patch.body = fields.body?.trim() || null;
    if (fields.tags !== undefined) patch.tags = normalizeTags(fields.tags);
    if (fields.pinned !== undefined) patch.pinned = fields.pinned;
    if (fields.color !== undefined) patch.color = fields.color || 'default';
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('admin_notes')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Note not found or not yours to edit');
    return data as AdminNote;
  } catch (e) {
    fail(e, 'updateNote');
  }
}

export async function togglePinned(note: AdminNote): Promise<AdminNote> {
  return updateNote(note.id, { pinned: !note.pinned });
}

export async function deleteNote(id: string): Promise<void> {
  try {
    const userId = await currentUserId();
    const { error } = await supabase
      .from('admin_notes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (e) {
    fail(e, 'deleteNote');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════

/** Return a short preview string for the note card. */
export function previewBody(body: string | null, maxChars = 180): string {
  if (!body) return '';
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  return flat.slice(0, maxChars).trimEnd() + '…';
}

/** "Updated just now" / "Updated 2h ago" / "Updated Apr 14". */
export function formatUpdatedLabel(
  iso: string | null,
  now = Date.now()
): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (isNaN(ts)) return '';
  const diff = now - ts;
  const mins = Math.round(diff / (60 * 1000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  if (days <= 7) return `Updated ${days}d ago`;
  return `Updated ${new Date(ts).toLocaleDateString()}`;
}
