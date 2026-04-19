/**
 * customerActivitiesService — CRM activity timeline (mobile)
 *
 * Writes/reads `customer_activities`. One row per event on a customer's
 * timeline (call, email, meeting, note, follow_up, status_change, system).
 *
 * RLS: Admin full access on customer_activities (any authenticated user).
 */
import { supabase } from './supabase';

export type ActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'follow_up'
  | 'status_change'
  | 'system';

export interface ActivityTypeMeta {
  key: ActivityType;
  label: string;
  icon: 'phone' | 'mail' | 'calendar' | 'notebook-pen' | 'bell' | 'arrow-right' | 'cog';
  hex: string;
}

export const ACTIVITY_TYPES: ActivityTypeMeta[] = [
  { key: 'call',          label: 'Call',          icon: 'phone',         hex: '#10b981' },
  { key: 'email',         label: 'Email',         icon: 'mail',          hex: '#0ea5e9' },
  { key: 'meeting',       label: 'Meeting',       icon: 'calendar',      hex: '#a855f7' },
  { key: 'note',          label: 'Note',          icon: 'notebook-pen',  hex: '#f59e0b' },
  { key: 'follow_up',     label: 'Follow-up',     icon: 'bell',          hex: '#6366f1' },
  { key: 'status_change', label: 'Status change', icon: 'arrow-right',   hex: '#64748b' },
  { key: 'system',        label: 'System',        icon: 'cog',           hex: '#475569' },
];

export function activityTypeMeta(key: string | null | undefined): ActivityTypeMeta {
  return ACTIVITY_TYPES.find((t) => t.key === key) || ACTIVITY_TYPES[3];
}

export interface CustomerActivity {
  id: string;
  customer_id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface CreateActivityInput {
  customer_id: string;
  type: ActivityType;
  title: string;
  description?: string | null;
  metadata?: Record<string, any>;
}

function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[customerActivitiesService] ${label}:`, e);
  throw e;
}

function toActivity(row: any): CustomerActivity {
  return {
    id: row.id,
    customer_id: row.customer_id,
    type: (row.type as ActivityType) || 'note',
    title: row.title,
    description: row.description ?? null,
    metadata: row.metadata ?? {},
    created_by: row.created_by ?? null,
    created_by_name: row.created_by_name ?? null,
    created_at: row.created_at,
  };
}

export async function listActivities(customerId: string, limit = 100): Promise<CustomerActivity[]> {
  try {
    const { data, error } = await supabase
      .from('customer_activities')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(toActivity);
  } catch (e) {
    err(e, 'listActivities');
  }
}

export async function createActivity(input: CreateActivityInput): Promise<CustomerActivity> {
  try {
    // Best-effort: attach the current authed user's display name for attribution.
    const { data: { user } } = await supabase.auth.getUser();
    let createdByName: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name,first_name,email')
        .eq('id', user.id)
        .maybeSingle();
      createdByName = profile?.full_name || profile?.first_name || profile?.email || null;
    }

    const { data, error } = await supabase
      .from('customer_activities')
      .insert({
        customer_id: input.customer_id,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
        created_by: user?.id ?? null,
        created_by_name: createdByName,
      })
      .select()
      .single();
    if (error) throw error;

    // Bump profile.last_activity_at for the customer.
    await supabase
      .from('profiles')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', input.customer_id);

    return toActivity(data);
  } catch (e) {
    err(e, 'createActivity');
  }
}

export async function deleteActivity(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('customer_activities').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteActivity');
  }
}
