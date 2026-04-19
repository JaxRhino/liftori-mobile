/**
 * tasksService — CRUD + helpers for the admin_tasks table.
 *
 * Shape mirrors the web admin's task list: title + description + status +
 * priority + due_date + project_id. status moves through todo →
 * in_progress → done. `done` is the finished state — we don't use a
 * separate `completed_at` column (the DB doesn't have one), we just
 * treat status='done' as the boolean.
 *
 * All writes stamp `user_id = auth.uid()` so the My Tasks view can
 * scope to the signed-in user. The table has admin-only RLS today; the
 * service filter is belt-and-suspenders for when non-admin roles join.
 */
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════════════════
// Types & enums
// ═══════════════════════════════════════════════════════════════════════

export type TaskStatus = 'todo' | 'in_progress' | 'done' | string;
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent' | string;

export const TASK_STATUSES: {
  key: TaskStatus;
  label: string;
  color: string;
}[] = [
  { key: 'todo', label: 'To do', color: 'slate' },
  { key: 'in_progress', label: 'In progress', color: 'sky' },
  { key: 'done', label: 'Done', color: 'emerald' },
];

export const TASK_PRIORITIES: {
  key: TaskPriority;
  label: string;
  color: string;
}[] = [
  { key: 'low', label: 'Low', color: 'slate' },
  { key: 'medium', label: 'Medium', color: 'sky' },
  { key: 'high', label: 'High', color: 'amber' },
  { key: 'urgent', label: 'Urgent', color: 'rose' },
];

export interface AdminTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null; // YYYY-MM-DD
  project_id: string | null;
  user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  project_id?: string | null;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;

export interface TaskFilter {
  ownerId?: string | null; // null = everyone's tasks
  status?: TaskStatus[]; // include these statuses
  priority?: TaskPriority[];
  search?: string;
  includeDone?: boolean; // default false — done tasks hide unless asked
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const SELECT_FIELDS =
  'id, title, description, status, priority, due_date, project_id, user_id, created_at, updated_at';

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

// ═══════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════

export async function listTasks(filter: TaskFilter = {}): Promise<AdminTask[]> {
  try {
    const ownerId =
      filter.ownerId === null
        ? null
        : filter.ownerId ?? (await currentUserId());

    let query = supabase
      .from('admin_tasks')
      .select(SELECT_FIELDS)
      .order('status', { ascending: true })
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(filter.limit ?? 200);

    if (ownerId) query = query.eq('user_id', ownerId);

    if (filter.status && filter.status.length > 0) {
      query = query.in('status', filter.status);
    } else if (!filter.includeDone) {
      query = query.not('status', 'eq', 'done');
    }

    if (filter.priority && filter.priority.length > 0) {
      query = query.in('priority', filter.priority);
    }

    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim().replace(/[%,]/g, '');
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as AdminTask[]) ?? [];
  } catch (e) {
    fail(e, 'listTasks');
  }
}

/**
 * List tasks due in the next N days (default 7) that are not done. Used
 * for home-screen "due soon" widgets.
 */
export async function listTasksDueSoon(opts: {
  ownerId?: string | null;
  days?: number;
  limit?: number;
} = {}): Promise<AdminTask[]> {
  try {
    const ownerId =
      opts.ownerId === null ? null : opts.ownerId ?? (await currentUserId());
    const today = new Date();
    const horizon = new Date();
    horizon.setDate(today.getDate() + (opts.days ?? 7));

    const toKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    let query = supabase
      .from('admin_tasks')
      .select(SELECT_FIELDS)
      .not('status', 'eq', 'done')
      .not('due_date', 'is', null)
      .lte('due_date', toKey(horizon))
      .order('due_date', { ascending: true })
      .limit(opts.limit ?? 10);
    if (ownerId) query = query.eq('user_id', ownerId);

    const { data, error } = await query;
    if (error) throw error;
    return (data as AdminTask[]) ?? [];
  } catch (e) {
    fail(e, 'listTasksDueSoon');
  }
}

export async function fetchTask(id: string): Promise<AdminTask | null> {
  try {
    const { data, error } = await supabase
      .from('admin_tasks')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as AdminTask) ?? null;
  } catch (e) {
    fail(e, 'fetchTask');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════════

export async function createTask(
  payload: CreateTaskInput
): Promise<AdminTask> {
  try {
    const userId = await currentUserId();
    const insert = {
      title: payload.title.trim() || 'Untitled task',
      description: payload.description?.trim() || null,
      status: payload.status || 'todo',
      priority: payload.priority || 'medium',
      due_date: payload.due_date || null,
      project_id: payload.project_id || null,
      user_id: userId,
    };
    const { data, error } = await supabase
      .from('admin_tasks')
      .insert(insert)
      .select(SELECT_FIELDS)
      .single();
    if (error) throw error;
    return data as AdminTask;
  } catch (e) {
    fail(e, 'createTask');
  }
}

export async function updateTask(
  id: string,
  fields: UpdateTaskInput
): Promise<AdminTask> {
  try {
    const userId = await currentUserId();
    const patch: Record<string, unknown> = {};
    if (fields.title !== undefined)
      patch.title = fields.title.trim() || 'Untitled task';
    if (fields.description !== undefined)
      patch.description = fields.description?.trim() || null;
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.priority !== undefined) patch.priority = fields.priority;
    if (fields.due_date !== undefined) patch.due_date = fields.due_date || null;
    if (fields.project_id !== undefined)
      patch.project_id = fields.project_id || null;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('admin_tasks')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Task not found or not yours to edit');
    return data as AdminTask;
  } catch (e) {
    fail(e, 'updateTask');
  }
}

/** Toggle between `todo`/`in_progress` and `done`. */
export async function toggleTaskDone(
  task: AdminTask
): Promise<AdminTask> {
  const next: TaskStatus = task.status === 'done' ? 'todo' : 'done';
  return updateTask(task.id, { status: next });
}

export async function deleteTask(id: string): Promise<void> {
  try {
    const userId = await currentUserId();
    const { error } = await supabase
      .from('admin_tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (e) {
    fail(e, 'deleteTask');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Display helpers
// ═══════════════════════════════════════════════════════════════════════

export function priorityMeta(p: TaskPriority | null): {
  label: string;
  color: string;
  weight: number;
} {
  switch (p) {
    case 'urgent':
      return { label: 'Urgent', color: '#f43f5e', weight: 4 };
    case 'high':
      return { label: 'High', color: '#f59e0b', weight: 3 };
    case 'medium':
      return { label: 'Medium', color: '#0ea5e9', weight: 2 };
    case 'low':
      return { label: 'Low', color: '#64748b', weight: 1 };
    default:
      return { label: 'Medium', color: '#0ea5e9', weight: 2 };
  }
}

export function statusMeta(s: TaskStatus | null): {
  label: string;
  color: string;
} {
  switch (s) {
    case 'done':
      return { label: 'Done', color: '#10b981' };
    case 'in_progress':
      return { label: 'In progress', color: '#0ea5e9' };
    case 'todo':
      return { label: 'To do', color: '#94a3b8' };
    default:
      return { label: s ?? 'To do', color: '#94a3b8' };
  }
}

/** Short "Due …" label with overdue/soon hints. */
export function formatDueLabel(
  due: string | null,
  now = Date.now()
): {
  label: string;
  overdue: boolean;
  soon: boolean;
} {
  if (!due) return { label: 'No due date', overdue: false, soon: false };
  const ts = Date.parse(due);
  if (isNaN(ts)) return { label: due, overdue: false, soon: false };
  const diff = ts - now;
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  if (days < 0) {
    const abs = Math.abs(days);
    return {
      label: abs === 1 ? '1d overdue' : `${abs}d overdue`,
      overdue: true,
      soon: false,
    };
  }
  if (days === 0) return { label: 'Due today', overdue: false, soon: true };
  if (days === 1) return { label: 'Due tomorrow', overdue: false, soon: true };
  if (days <= 7)
    return { label: `Due in ${days}d`, overdue: false, soon: true };
  return { label: `Due ${new Date(ts).toLocaleDateString()}`, overdue: false, soon: false };
}
