/**
 * eosService — read-side helpers for Liftori's Entrepreneurial Operating
 * System tables (rocks, issues, todos, scorecard).
 *
 * The EOS tables already exist in Supabase with permissive RLS, so any
 * signed-in user can read them today. Writes are out of scope for v1 —
 * the web admin is the authoring surface. The mobile home screen just
 * needs a dashboard-style glance: "what's this quarter look like for
 * me?"
 *
 * We resolve "me" via supabase.auth.getUser() and scope owner-specific
 * queries with that UID. For surfaces that should show the whole team
 * (e.g. company-wide open issues), we leave owner filters off.
 */
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════════════════
// Types — trimmed to the fields the mobile UI actually reads
// ═══════════════════════════════════════════════════════════════════════

export type RockStatus = 'not_started' | 'on_track' | 'off_track' | 'at_risk' | 'complete' | string;

export interface EosRock {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  quarter: string; // e.g. "Q2-2026" or "2026-Q2"
  quarter_start_date: string | null;
  quarter_end_date: string | null;
  progress_percentage: number | null;
  status: RockStatus | null;
  is_complete: boolean | null;
  department: string | null;
  rock_type: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type IssueStatus = 'identified' | 'discussing' | 'solved' | 'archived' | string;
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical' | string;

export interface EosIssue {
  id: string;
  title: string;
  description: string | null;
  priority: IssuePriority | null;
  status: IssueStatus | null;
  owner_id: string | null;
  reporter_id: string | null;
  department: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type TodoStatus = 'pending' | 'in_progress' | 'complete' | 'cancelled' | string;

export interface EosTodo {
  id: string;
  task: string;
  description: string | null;
  owner_id: string | null;
  due_date: string;
  priority: IssuePriority | null;
  status: TodoStatus | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface EosDashboard {
  /** Label like "Q2 2026". */
  quarterLabel: string;
  /** Value we try first when filtering rocks by quarter. */
  quarterKey: string;
  rocks: EosRock[];
  issues: EosIssue[];
  todos: EosTodo[];
  /** Pre-computed stats so the home screen doesn't have to re-derive. */
  stats: {
    rocksTotal: number;
    rocksOnTrack: number;
    rocksAtRisk: number;
    rocksComplete: number;
    issuesOpen: number;
    todosDueSoon: number; // due in ≤7 days, not complete
    todosOverdue: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

/**
 * Return the current quarter in both a human label and the likely row
 * value. The DB stores quarter as free-form text; the web admin uses
 * "Q{n}-{year}" (e.g., "Q2-2026"). We return that as the primary key,
 * but the fetcher also accepts the inverse "YYYY-Qn" shape when both
 * are in play.
 */
export function getCurrentQuarter(now = new Date()): {
  label: string;
  key: string;
  alt: string;
  year: number;
  quarter: number;
} {
  const month = now.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  const year = now.getFullYear();
  return {
    label: `Q${quarter} ${year}`,
    key: `Q${quarter}-${year}`,
    alt: `${year}-Q${quarter}`,
    year,
    quarter,
  };
}

function isOpenIssue(status: IssueStatus | null, archivedAt: string | null): boolean {
  if (archivedAt) return false;
  if (!status) return true;
  return status !== 'solved' && status !== 'archived';
}

function isOpenTodo(status: TodoStatus | null, completedAt: string | null): boolean {
  if (completedAt) return false;
  if (!status) return true;
  return status !== 'complete' && status !== 'cancelled';
}

const ROCK_FIELDS =
  'id, title, description, owner_id, quarter, quarter_start_date, quarter_end_date, progress_percentage, status, is_complete, department, rock_type, created_at, updated_at';

const ISSUE_FIELDS =
  'id, title, description, priority, status, owner_id, reporter_id, department, archived_at, created_at, updated_at';

const TODO_FIELDS =
  'id, task, description, owner_id, due_date, priority, status, completed_at, created_at';

// ═══════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════

/**
 * List rocks for a given quarter. We try `Q{n}-{year}` first and fall
 * back to `{year}-Q{n}` if nothing matches — both conventions exist in
 * the wild. Callers can override `quarterKeys` if they want explicit
 * control.
 */
export async function listRocksForQuarter(opts: {
  ownerId?: string | null;
  quarterKeys?: string[];
  limit?: number;
} = {}): Promise<EosRock[]> {
  const q = getCurrentQuarter();
  const keys = opts.quarterKeys ?? [q.key, q.alt];
  let query = supabase
    .from('eos_rocks')
    .select(ROCK_FIELDS)
    .in('quarter', keys)
    .order('progress_percentage', { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 50);
  if (opts.ownerId) query = query.eq('owner_id', opts.ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as EosRock[]) ?? [];
}

export async function listOpenIssues(opts: {
  ownerId?: string | null;
  limit?: number;
} = {}): Promise<EosIssue[]> {
  let query = supabase
    .from('eos_issues')
    .select(ISSUE_FIELDS)
    .is('archived_at', null)
    .not('status', 'in', '("solved","archived")')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.ownerId) query = query.eq('owner_id', opts.ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as EosIssue[]) ?? [];
}

export async function listMyOpenTodos(opts: {
  ownerId?: string;
  limit?: number;
} = {}): Promise<EosTodo[]> {
  const ownerId = opts.ownerId ?? (await currentUserId());
  const { data, error } = await supabase
    .from('eos_todos')
    .select(TODO_FIELDS)
    .eq('owner_id', ownerId)
    .not('status', 'in', '("complete","cancelled")')
    .order('due_date', { ascending: true })
    .limit(opts.limit ?? 20);
  if (error) throw error;
  return (data as EosTodo[]) ?? [];
}

/**
 * Single fetch that powers the home-screen EOS widget. Parallelises
 * the three sub-queries with Promise.all + per-source try/catch so a
 * failure in one doesn't tank the whole dashboard (pattern borrowed
 * from leadsService).
 */
export async function getEosDashboard(opts: {
  rocksOwnerId?: string | null;
  todosOwnerId?: string;
  rocksLimit?: number;
  issuesLimit?: number;
  todosLimit?: number;
} = {}): Promise<EosDashboard> {
  const q = getCurrentQuarter();

  const [rocks, issues, todos] = await Promise.all([
    listRocksForQuarter({
      ownerId: opts.rocksOwnerId ?? null,
      limit: opts.rocksLimit ?? 20,
    }).catch((e) => {
      console.warn('[eos] rocks fetch failed:', e);
      return [] as EosRock[];
    }),
    listOpenIssues({ limit: opts.issuesLimit ?? 20 }).catch((e) => {
      console.warn('[eos] issues fetch failed:', e);
      return [] as EosIssue[];
    }),
    listMyOpenTodos({
      ownerId: opts.todosOwnerId,
      limit: opts.todosLimit ?? 20,
    }).catch((e) => {
      console.warn('[eos] todos fetch failed:', e);
      return [] as EosTodo[];
    }),
  ]);

  // ── Stats ────────────────────────────────────────────────────────
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  let rocksOnTrack = 0;
  let rocksAtRisk = 0;
  let rocksComplete = 0;
  for (const r of rocks) {
    if (r.is_complete || r.status === 'complete') {
      rocksComplete++;
    } else if (r.status === 'on_track') {
      rocksOnTrack++;
    } else if (r.status === 'at_risk' || r.status === 'off_track') {
      rocksAtRisk++;
    } else if ((r.progress_percentage ?? 0) < 40) {
      // Fallback heuristic when status isn't explicitly set
      const end = r.quarter_end_date ? Date.parse(r.quarter_end_date) : null;
      if (end && end - now < 30 * 24 * 60 * 60 * 1000) {
        rocksAtRisk++;
      }
    }
  }

  const issuesOpen = issues.filter((i) =>
    isOpenIssue(i.status ?? null, i.archived_at ?? null)
  ).length;

  let todosDueSoon = 0;
  let todosOverdue = 0;
  for (const t of todos) {
    if (!isOpenTodo(t.status ?? null, t.completed_at ?? null)) continue;
    const due = Date.parse(t.due_date);
    if (isNaN(due)) continue;
    if (due < now) todosOverdue++;
    else if (due - now <= sevenDaysMs) todosDueSoon++;
  }

  return {
    quarterLabel: q.label,
    quarterKey: q.key,
    rocks,
    issues,
    todos,
    stats: {
      rocksTotal: rocks.length,
      rocksOnTrack,
      rocksAtRisk,
      rocksComplete,
      issuesOpen,
      todosDueSoon,
      todosOverdue,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Display helpers
// ═══════════════════════════════════════════════════════════════════════

export function rockProgressColor(
  rock: EosRock,
  palette: { emerald: string; amber: string; rose: string; sky: string }
): string {
  if (rock.is_complete || rock.status === 'complete') return palette.emerald;
  if (rock.status === 'at_risk' || rock.status === 'off_track') return palette.rose;
  if (rock.status === 'on_track') return palette.emerald;
  const pct = rock.progress_percentage ?? 0;
  if (pct >= 75) return palette.emerald;
  if (pct >= 40) return palette.amber;
  return palette.sky;
}

export function priorityLabel(p: IssuePriority | null): string {
  if (!p) return 'Normal';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function formatDueLabel(iso: string, now = Date.now()): {
  label: string;
  overdue: boolean;
  soon: boolean;
} {
  const ts = Date.parse(iso);
  if (isNaN(ts)) return { label: '—', overdue: false, soon: false };
  const diffMs = ts - now;
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days < 0) {
    const abs = Math.abs(days);
    return {
      label: abs === 1 ? '1 day overdue' : `${abs} days overdue`,
      overdue: true,
      soon: false,
    };
  }
  if (days === 0) return { label: 'Due today', overdue: false, soon: true };
  if (days === 1) return { label: 'Due tomorrow', overdue: false, soon: true };
  if (days <= 7) return { label: `Due in ${days}d`, overdue: false, soon: true };
  return { label: `Due ${new Date(ts).toLocaleDateString()}`, overdue: false, soon: false };
}
