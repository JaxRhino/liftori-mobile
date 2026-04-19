/**
 * customersService — Liftori CRM customers (mobile)
 *
 * Mirrors the web admin's Customers page CRM pipeline. The underlying table
 * is `profiles` with `role = 'customer'`. Web admin: liftori-admin/src/pages/Customers.jsx.
 *
 * The 8-stage CRM pipeline (prospect → churned) lives on `profiles.crm_stage`.
 * Temperature (hot/warm/cold) lives on `profiles.lead_temperature`.
 *
 * RLS: admin_full_access on profiles via is_admin(). Admins see all rows;
 * customers only see their own. Follow the admin path — Ryan is admin.
 */
import { supabase } from './supabase';

// ─── Stage catalog ──────────────────────────────────────────────────
export type CrmStage =
  | 'prospect'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'active'
  | 'at_risk'
  | 'churned';

export interface StageMeta {
  key: CrmStage;
  label: string;
  color: string; // theme token key
  hex: string;   // pre-resolved hex for pills without theme dep
  order: number;
}

export const CRM_STAGES: StageMeta[] = [
  { key: 'prospect',    label: 'Prospect',    color: 'slate',   hex: '#64748b', order: 0 },
  { key: 'qualified',   label: 'Qualified',   color: 'sky',     hex: '#0ea5e9', order: 1 },
  { key: 'proposal',    label: 'Proposal',    color: 'indigo',  hex: '#6366f1', order: 2 },
  { key: 'negotiation', label: 'Negotiation', color: 'amber',   hex: '#f59e0b', order: 3 },
  { key: 'won',         label: 'Won',         color: 'emerald', hex: '#10b981', order: 4 },
  { key: 'active',      label: 'Active',      color: 'emerald', hex: '#059669', order: 5 },
  { key: 'at_risk',     label: 'At Risk',     color: 'rose',    hex: '#f43f5e', order: 6 },
  { key: 'churned',     label: 'Churned',     color: 'muted',   hex: '#475569', order: 7 },
];

export function stageMeta(key: string | null | undefined): StageMeta {
  const s = CRM_STAGES.find((x) => x.key === key);
  return s || { key: 'prospect', label: 'Prospect', color: 'slate', hex: '#64748b', order: 0 };
}

export function isOpenStage(stage: CrmStage): boolean {
  return stage !== 'won' && stage !== 'churned';
}

// ─── Temperature ────────────────────────────────────────────────────
export type Temperature = 'hot' | 'warm' | 'cold';

export interface TemperatureMeta {
  key: Temperature;
  label: string;
  hex: string;
  icon: 'flame' | 'thermometer' | 'snowflake';
}

export const TEMPERATURES: TemperatureMeta[] = [
  { key: 'hot',  label: 'Hot',  hex: '#f43f5e', icon: 'flame' },
  { key: 'warm', label: 'Warm', hex: '#f59e0b', icon: 'thermometer' },
  { key: 'cold', label: 'Cold', hex: '#0ea5e9', icon: 'snowflake' },
];

export function temperatureMeta(key: string | null | undefined): TemperatureMeta {
  return TEMPERATURES.find((t) => t.key === key) || TEMPERATURES[2];
}

// ─── Source catalog ─────────────────────────────────────────────────
export type CustomerSource =
  | 'inbound'
  | 'outbound'
  | 'referral'
  | 'affiliate'
  | 'event'
  | 'waitlist'
  | 'labos'
  | 'consulting'
  | 'digital'
  | 'other';

export const CUSTOMER_SOURCES: { key: CustomerSource; label: string }[] = [
  { key: 'inbound',   label: 'Inbound' },
  { key: 'referral',  label: 'Referral' },
  { key: 'outbound',  label: 'Outbound' },
  { key: 'event',     label: 'Event' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'waitlist',  label: 'Waitlist' },
  { key: 'labos',     label: 'LABOS' },
  { key: 'consulting',label: 'Consulting' },
  { key: 'digital',   label: 'Digital Product' },
  { key: 'other',     label: 'Other' },
];

// ─── Row type ───────────────────────────────────────────────────────
export interface Customer {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  title: string | null;

  company_name: string | null;
  company_website: string | null;
  company_industry: string | null;

  crm_stage: CrmStage;
  lead_temperature: Temperature;
  lead_score: number;
  estimated_value: number; // numeric in dollars
  source: CustomerSource | null;
  referral_source: string | null;

  last_activity_at: string | null;
  next_follow_up_at: string | null;
  follow_up_notes: string | null;

  status: string | null;
  tags: string[];
  internal_notes: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[customersService] ${label}:`, e);
  throw e;
}

function toCustomer(row: any): Customer {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    phone: row.phone ?? null,
    avatar_url: row.avatar_url ?? null,
    title: row.title ?? null,

    company_name: row.company_name ?? null,
    company_website: row.company_website ?? null,
    company_industry: row.company_industry ?? null,

    crm_stage: (row.crm_stage as CrmStage) ?? 'prospect',
    lead_temperature: (row.lead_temperature as Temperature) ?? 'cold',
    lead_score: Number(row.lead_score ?? 0) || 0,
    estimated_value: Number(row.estimated_value ?? 0) || 0,
    source: (row.source as CustomerSource) ?? null,
    referral_source: row.referral_source ?? null,

    last_activity_at: row.last_activity_at ?? null,
    next_follow_up_at: row.next_follow_up_at ?? null,
    follow_up_notes: row.follow_up_notes ?? null,

    status: row.status ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    internal_notes: row.internal_notes ?? null,

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function displayName(c: Pick<Customer, 'full_name' | 'first_name' | 'last_name' | 'email'>): string {
  if (c.full_name && c.full_name.trim()) return c.full_name.trim();
  const parts = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (parts) return parts;
  return c.email || 'Customer';
}

export function initials(c: Pick<Customer, 'full_name' | 'first_name' | 'last_name' | 'email'>): string {
  const name = displayName(c);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export function formatEstimatedValue(value: number): string {
  if (!value) return '$0';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffMs = Date.now() - t;
  if (diffMs < 0) {
    // future — due in
    const abs = Math.abs(diffMs);
    const mins = Math.round(abs / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    const days = Math.round(hrs / 24);
    return `in ${days}d`;
  }
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

// ─── CRUD ───────────────────────────────────────────────────────────
export interface ListCustomersOptions {
  stage?: CrmStage | 'all';
  temperature?: Temperature | 'all';
  search?: string;
  limit?: number;
}

export async function listCustomers(opts: ListCustomersOptions = {}): Promise<Customer[]> {
  try {
    let q = supabase
      .from('profiles')
      .select('*')
      .eq('role', 'customer')
      .order('updated_at', { ascending: false, nullsFirst: false });

    if (opts.stage && opts.stage !== 'all') q = q.eq('crm_stage', opts.stage);
    if (opts.temperature && opts.temperature !== 'all') q = q.eq('lead_temperature', opts.temperature);
    if (opts.search && opts.search.trim()) {
      const s = opts.search.trim().replace(/[,%]/g, ' ');
      q = q.or(
        `full_name.ilike.%${s}%,email.ilike.%${s}%,company_name.ilike.%${s}%,phone.ilike.%${s}%`
      );
    }
    if (opts.limit) q = q.limit(opts.limit);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(toCustomer);
  } catch (e) {
    err(e, 'listCustomers');
  }
}

export async function fetchCustomer(id: string): Promise<Customer | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toCustomer(data) : null;
  } catch (e) {
    err(e, 'fetchCustomer');
  }
}

export interface CustomerUpdateInput {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  title?: string | null;
  company_name?: string | null;
  company_website?: string | null;
  company_industry?: string | null;
  crm_stage?: CrmStage;
  lead_temperature?: Temperature;
  lead_score?: number;
  estimated_value?: number;
  source?: CustomerSource | null;
  referral_source?: string | null;
  next_follow_up_at?: string | null;
  follow_up_notes?: string | null;
  tags?: string[];
  internal_notes?: string | null;
  status?: string | null;
}

export async function updateCustomer(id: string, patch: CustomerUpdateInput): Promise<Customer> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toCustomer(data);
  } catch (e) {
    err(e, 'updateCustomer');
  }
}

export async function updateStage(id: string, stage: CrmStage): Promise<Customer> {
  return updateCustomer(id, { crm_stage: stage });
}

export async function updateTemperature(id: string, temp: Temperature): Promise<Customer> {
  return updateCustomer(id, { lead_temperature: temp });
}

// ─── Pipeline grouping ──────────────────────────────────────────────
export function groupByStage(customers: Customer[]): Record<CrmStage, Customer[]> {
  const out = {} as Record<CrmStage, Customer[]>;
  CRM_STAGES.forEach((s) => { out[s.key] = []; });
  customers.forEach((c) => {
    const key = (out[c.crm_stage] ? c.crm_stage : 'prospect') as CrmStage;
    out[key].push(c);
  });
  return out;
}

// ─── Summary stats ──────────────────────────────────────────────────
export interface CustomersSummary {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  openPipeline: number;
  wonCount: number;
  pipelineValue: number;
  byStage: Record<CrmStage, number>;
}

export function summarize(customers: Customer[]): CustomersSummary {
  const byStage = {} as Record<CrmStage, number>;
  CRM_STAGES.forEach((s) => { byStage[s.key] = 0; });
  let pipelineValue = 0;
  let hot = 0, warm = 0, cold = 0;
  let openPipeline = 0;
  let wonCount = 0;
  customers.forEach((c) => {
    byStage[c.crm_stage] = (byStage[c.crm_stage] || 0) + 1;
    if (c.lead_temperature === 'hot') hot++;
    else if (c.lead_temperature === 'warm') warm++;
    else cold++;
    if (isOpenStage(c.crm_stage)) {
      openPipeline++;
      pipelineValue += c.estimated_value;
    }
    if (c.crm_stage === 'won' || c.crm_stage === 'active') wonCount++;
  });
  return {
    total: customers.length,
    hot, warm, cold,
    openPipeline,
    wonCount,
    pipelineValue,
    byStage,
  };
}
