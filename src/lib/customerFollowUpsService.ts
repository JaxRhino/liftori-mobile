/**
 * customerFollowUpsService — CRM follow-up scheduling (mobile)
 *
 * Writes/reads `customer_follow_ups`. Scheduled actions tied to a customer:
 * a call to make, proposal to send, demo to run, check-in, etc.
 *
 * RLS: Admin full access (any authenticated user).
 */
import { supabase } from './supabase';

export type FollowUpType =
  | 'follow_up'
  | 'call_back'
  | 'send_proposal'
  | 'check_in'
  | 'demo';

export interface FollowUpTypeMeta {
  key: FollowUpType;
  label: string;
  icon: 'bell' | 'phone' | 'file-text' | 'heart' | 'monitor';
}

export const FOLLOW_UP_TYPES: FollowUpTypeMeta[] = [
  { key: 'follow_up',     label: 'Follow-up',    icon: 'bell' },
  { key: 'call_back',     label: 'Call back',    icon: 'phone' },
  { key: 'send_proposal', label: 'Send proposal',icon: 'file-text' },
  { key: 'check_in',      label: 'Check in',     icon: 'heart' },
  { key: 'demo',          label: 'Demo',         icon: 'monitor' },
];

export function followUpTypeMeta(key: string | null | undefined): FollowUpTypeMeta {
  return FOLLOW_UP_TYPES.find((t) => t.key === key) || FOLLOW_UP_TYPES[0];
}

export type FollowUpPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface FollowUpPriorityMeta {
  key: FollowUpPriority;
  label: string;
  hex: string;
  weight: number;
}

export const FOLLOW_UP_PRIORITIES: FollowUpPriorityMeta[] = [
  { key: 'low',    label: 'Low',    hex: '#64748b', weight: 1 },
  { key: 'normal', label: 'Normal', hex: '#0ea5e9', weight: 2 },
  { key: 'high',   label: 'High',   hex: '#f59e0b', weight: 3 },
  { key: 'urgent', label: 'Urgent', hex: '#f43f5e', weight: 4 },
];

export function priorityMeta(key: string | null | undefined): FollowUpPriorityMeta {
  return FOLLOW_UP_PRIORITIES.find((p) => p.key === key) || FOLLOW_UP_PRIORITIES[1];
}

export interface CustomerFollowUp {
  id: string;
  customer_id: string;
  type: FollowUpType;
  title: string;
  description: string | null;
  due_at: string;
  completed_at: string | null;
  completed_by: string | null;
  priority: FollowUpPriority;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  created_at: string;
  // Optional join for open follow-ups list.
  customer?: {
    id: string;
    full_name: string | null;
    email: string | null;
    company_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface CreateFollowUpInput {
  customer_id: string;
  type?: FollowUpType;
  title: string;
  description?: string | null;
  due_at: string; // ISO
  priority?: FollowUpPriority;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
}

export interface UpdateFollowUpInput {
  type?: FollowUpType;
  title?: string;
  description?: string | null;
  due_at?: string;
  priority?: FollowUpPriority;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
}

function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[customerFollowUpsService] ${label}:`, e);
  throw e;
}

function toFollowUp(row: any): CustomerFollowUp {
  return {
    id: row.id,
    customer_id: row.customer_id,
    type: (row.type as FollowUpType) || 'follow_up',
    title: row.title,
    description: row.description ?? null,
    due_at: row.due_at,
    completed_at: row.completed_at ?? null,
    completed_by: row.completed_by ?? null,
    priority: (row.priority as FollowUpPriority) || 'normal',
    assigned_to: row.assigned_to ?? null,
    assigned_to_name: row.assigned_to_name ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    customer: row.customer
      ? {
          id: row.customer.id,
          full_name: row.customer.full_name ?? null,
          email: row.customer.email ?? null,
          company_name: row.customer.company_name ?? null,
          avatar_url: row.customer.avatar_url ?? null,
        }
      : null,
  };
}

export async function listCustomerFollowUps(
  customerId: string,
  opts: { includeCompleted?: boolean } = {}
): Promise<CustomerFollowUp[]> {
  try {
    let q = supabase
      .from('customer_follow_ups')
      .select('*')
      .eq('customer_id', customerId)
      .order('due_at', { ascending: true });
    if (!opts.includeCompleted) q = q.is('completed_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(toFollowUp);
  } catch (e) {
    err(e, 'listCustomerFollowUps');
  }
}

export async function listOpenFollowUps(limit = 50): Promise<CustomerFollowUp[]> {
  try {
    const { data, error } = await supabase
      .from('customer_follow_ups')
      .select('*, customer:profiles!customer_follow_ups_customer_id_fkey(id,full_name,email,company_name,avatar_url)')
      .is('completed_at', null)
      .order('due_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(toFollowUp);
  } catch (e) {
    err(e, 'listOpenFollowUps');
  }
}

export async function createFollowUp(input: CreateFollowUpInput): Promise<CustomerFollowUp> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('customer_follow_ups')
      .insert({
        customer_id: input.customer_id,
        type: input.type || 'follow_up',
        title: input.title,
        description: input.description ?? null,
        due_at: input.due_at,
        priority: input.priority || 'normal',
        assigned_to: input.assigned_to ?? null,
        assigned_to_name: input.assigned_to_name ?? null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Mirror next_follow_up_at onto the customer profile so the list view
    // can show upcoming dates without a join.
    await supabase
      .from('profiles')
      .update({ next_follow_up_at: input.due_at })
      .eq('id', input.customer_id);

    return toFollowUp(data);
  } catch (e) {
    err(e, 'createFollowUp');
  }
}

export async function updateFollowUp(id: string, patch: UpdateFollowUpInput): Promise<CustomerFollowUp> {
  try {
    const { data, error } = await supabase
      .from('customer_follow_ups')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toFollowUp(data);
  } catch (e) {
    err(e, 'updateFollowUp');
  }
}

export async function completeFollowUp(id: string): Promise<CustomerFollowUp> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('customer_follow_ups')
      .update({
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toFollowUp(data);
  } catch (e) {
    err(e, 'completeFollowUp');
  }
}

export async function reopenFollowUp(id: string): Promise<CustomerFollowUp> {
  try {
    const { data, error } = await supabase
      .from('customer_follow_ups')
      .update({ completed_at: null, completed_by: null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toFollowUp(data);
  } catch (e) {
    err(e, 'reopenFollowUp');
  }
}

export async function deleteFollowUp(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('customer_follow_ups').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteFollowUp');
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
export function formatDueLabel(iso: string): { label: string; overdue: boolean; soon: boolean } {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return { label: '—', overdue: false, soon: false };
  const diffMs = t - Date.now();
  const overdue = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const hours = absMs / 3_600_000;
  const days = absMs / 86_400_000;
  const soon = !overdue && hours <= 24;
  let label: string;
  if (overdue) {
    if (days >= 1) label = `Overdue ${Math.round(days)}d`;
    else if (hours >= 1) label = `Overdue ${Math.round(hours)}h`;
    else label = `Overdue`;
  } else {
    if (hours < 1) label = 'Due soon';
    else if (hours < 24) label = `Due in ${Math.round(hours)}h`;
    else if (days < 7) label = `Due in ${Math.round(days)}d`;
    else label = new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return { label, overdue, soon };
}
