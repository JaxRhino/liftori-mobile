/**
 * leadsService — Liftori's sales pipeline (mobile)
 *
 * Mirror of liftori-admin/src/lib/salesLeadsService.js. Any column/shape change
 * must be made in both files so desktop and mobile speak the same payload
 * shape. Three products, each with its own stage set.
 */
import { supabase } from './supabase';

// ─── Product catalog ────────────────────────────────────────────────
export type ProductKey = 'labos' | 'consulting' | 'custom_build';

export interface ProductMeta {
  key: ProductKey;
  label: string;
  longLabel: string;
  description: string;
  color: string;
  icon: string;
  hasMRR: boolean;
  hasOneTime: boolean;
}

export const PRODUCTS: Record<ProductKey, ProductMeta> = {
  labos: {
    key: 'labos',
    label: 'LABOS',
    longLabel: 'Liftori AI Business OS',
    description: 'SaaS subscription — tiered plans with AI departments.',
    color: 'sky',
    icon: 'cpu',
    hasMRR: true,
    hasOneTime: false,
  },
  consulting: {
    key: 'consulting',
    label: 'Consulting',
    longLabel: 'Business Consulting',
    description: 'Consulting-as-a-service — tiered packages, 1099 network.',
    color: 'amber',
    icon: 'briefcase',
    hasMRR: true,
    hasOneTime: true,
  },
  custom_build: {
    key: 'custom_build',
    label: 'Custom Builds',
    longLabel: 'Custom App / Platform Builds',
    description: 'One-off project builds — Starter / Growth / Scale tiers.',
    color: 'violet',
    icon: 'code',
    hasMRR: false,
    hasOneTime: true,
  },
};

export const PRODUCT_KEYS: ProductKey[] = ['labos', 'consulting', 'custom_build'];

// ─── Per-product stage configs ──────────────────────────────────────
export interface StageMeta {
  key: string;
  label: string;
  color: string;
}

export const STAGES: Record<ProductKey, StageMeta[]> = {
  labos: [
    { key: 'demo_requested', label: 'Demo Requested', color: 'slate' },
    { key: 'trial',          label: 'Trial / Demo',   color: 'blue' },
    { key: 'proposal',       label: 'Proposal Sent',  color: 'indigo' },
    { key: 'negotiation',    label: 'Negotiation',    color: 'amber' },
    { key: 'won',            label: 'Won',            color: 'emerald' },
    { key: 'lost',           label: 'Lost',           color: 'rose' },
  ],
  consulting: [
    { key: 'intro_call',  label: 'Intro Call',    color: 'slate' },
    { key: 'discovery',   label: 'Discovery',     color: 'blue' },
    { key: 'proposal',    label: 'Proposal Sent', color: 'indigo' },
    { key: 'contract',    label: 'Contract Sent', color: 'amber' },
    { key: 'won',         label: 'Won',           color: 'emerald' },
    { key: 'lost',        label: 'Lost',          color: 'rose' },
  ],
  custom_build: [
    { key: 'discovery', label: 'Discovery',       color: 'slate' },
    { key: 'scoping',   label: 'Scoping',         color: 'blue' },
    { key: 'quote',     label: 'Quote Sent',      color: 'indigo' },
    { key: 'contract',  label: 'Contract Signed', color: 'amber' },
    { key: 'won',       label: 'Won',             color: 'emerald' },
    { key: 'lost',      label: 'Lost',            color: 'rose' },
  ],
};

export type Source =
  | 'inbound'
  | 'outbound'
  | 'referral'
  | 'affiliate'
  | 'event'
  | 'waitlist'
  | 'other';

export const SOURCES: { key: Source; label: string }[] = [
  { key: 'inbound',   label: 'Inbound' },
  { key: 'referral',  label: 'Referral' },
  { key: 'outbound',  label: 'Outbound' },
  { key: 'event',     label: 'Event' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'waitlist',  label: 'Waitlist' },
  { key: 'other',     label: 'Other' },
];

export function stagesFor(productType: ProductKey): StageMeta[] {
  return STAGES[productType] || [];
}

export function stageMetaFor(productType: ProductKey, stageKey: string): StageMeta {
  const list = stagesFor(productType);
  return (
    list.find((s) => s.key === stageKey) || { key: stageKey, label: stageKey, color: 'slate' }
  );
}

export function isClosedStage(stage: string): boolean {
  return stage === 'won' || stage === 'lost';
}

// ─── Types ──────────────────────────────────────────────────────────
export interface Lead {
  id: string;
  product_type: ProductKey;
  stage: string;
  title: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  deal_value_cents: number;
  mrr_cents: number;
  probability: number;
  expected_close_date: string | null;
  source: Source | null;
  assigned_to: string | null;
  next_action: string | null;
  next_action_date: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stage_changed_at: string;
  assignee?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

export interface CreateLeadInput {
  product_type: ProductKey;
  stage?: string;
  title: string;
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  /** Dollar amount — converted to cents on insert. */
  deal_value?: number;
  /** Dollar amount — converted to cents on insert. */
  mrr?: number;
  probability?: number;
  expected_close_date?: string | null;
  source?: Source | null;
  assigned_to?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  description?: string | null;
  notes?: string | null;
  tags?: string[];
}

// ─── CRUD ────────────────────────────────────────────────────────────
function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[leadsService] ${label}:`, e);
  throw e;
}

interface ListOpts {
  productType?: ProductKey;
  stage?: string;
  assignedTo?: string;
  includeClosed?: boolean;
}

export async function listLeads(opts: ListOpts = {}): Promise<Lead[]> {
  let q = supabase
    .from('sales_leads')
    .select('*, assignee:assigned_to (id, full_name, email, avatar_url)')
    .order('stage_changed_at', { ascending: false });
  if (opts.productType) q = q.eq('product_type', opts.productType);
  if (opts.stage) q = q.eq('stage', opts.stage);
  if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo);
  if (opts.includeClosed === false) q = q.not('stage', 'in', '(won,lost)');
  const { data, error } = await q;
  if (error) err(error, 'listLeads');
  return (data as Lead[]) || [];
}

export async function getLead(id: string): Promise<Lead> {
  const { data, error } = await supabase
    .from('sales_leads')
    .select('*, assignee:assigned_to (id, full_name, email, avatar_url)')
    .eq('id', id)
    .single();
  if (error) err(error, 'getLead');
  return data as Lead;
}

export async function createLead(
  payload: CreateLeadInput,
  createdBy: string | null
): Promise<Lead> {
  const insert = {
    product_type: payload.product_type,
    stage: payload.stage || stagesFor(payload.product_type)[0]?.key,
    title: payload.title,
    company_name: payload.company_name || null,
    contact_name: payload.contact_name || null,
    contact_email: payload.contact_email || null,
    contact_phone: payload.contact_phone || null,
    deal_value_cents: Math.round((Number(payload.deal_value) || 0) * 100),
    mrr_cents: Math.round((Number(payload.mrr) || 0) * 100),
    probability: payload.probability ?? 50,
    expected_close_date: payload.expected_close_date || null,
    source: payload.source || null,
    assigned_to: payload.assigned_to || null,
    next_action: payload.next_action || null,
    next_action_date: payload.next_action_date || null,
    description: payload.description || null,
    notes: payload.notes || null,
    tags: payload.tags || [],
    created_by: createdBy || null,
  };
  const { data, error } = await supabase
    .from('sales_leads')
    .insert(insert)
    .select('*, assignee:assigned_to (id, full_name, email, avatar_url)')
    .single();
  if (error) err(error, 'createLead');
  return data as Lead;
}

export async function updateLead(id: string, patch: Partial<CreateLeadInput> & Record<string, unknown>): Promise<Lead> {
  const update: Record<string, unknown> = { ...patch };
  if ('deal_value' in update) {
    update.deal_value_cents = Math.round((Number(update.deal_value) || 0) * 100);
    delete update.deal_value;
  }
  if ('mrr' in update) {
    update.mrr_cents = Math.round((Number(update.mrr) || 0) * 100);
    delete update.mrr;
  }
  const { data, error } = await supabase
    .from('sales_leads')
    .update(update)
    .eq('id', id)
    .select('*, assignee:assigned_to (id, full_name, email, avatar_url)')
    .single();
  if (error) err(error, 'updateLead');
  return data as Lead;
}

export async function moveLeadStage(
  id: string,
  newStage: string,
  extra: Record<string, unknown> = {}
): Promise<Lead> {
  return updateLead(id, { stage: newStage, ...extra });
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('sales_leads').delete().eq('id', id);
  if (error) err(error, 'deleteLead');
}

// ─── Reporting helpers ──────────────────────────────────────────────
export function weightedValueCents(lead: Pick<Lead, 'deal_value_cents' | 'mrr_cents' | 'stage' | 'probability'>): number {
  const oneTime = lead.deal_value_cents || 0;
  const mrr = lead.mrr_cents || 0;
  const annualized = oneTime + mrr * 12;
  const prob = isClosedStage(lead.stage)
    ? lead.stage === 'won'
      ? 100
      : 0
    : lead.probability ?? 0;
  return Math.round((annualized * prob) / 100);
}

export function formatMoney(cents: number): string {
  const dollars = (cents || 0) / 100;
  if (dollars >= 1000) return `$${Math.round(dollars).toLocaleString()}`;
  return `$${dollars.toFixed(0)}`;
}

export interface LeadsSummary {
  total: number;
  openCount: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
  openWeightedCents: number;
  openPipelineCents: number;
  wonRevCents: number;
}

export function summarize(leads: Lead[]): LeadsSummary {
  const open = leads.filter((l) => !isClosedStage(l.stage));
  const won = leads.filter((l) => l.stage === 'won');
  const lost = leads.filter((l) => l.stage === 'lost');
  const openWeightedCents = open.reduce((sum, l) => sum + weightedValueCents(l), 0);
  const wonRevCents = won.reduce(
    (sum, l) => sum + (l.deal_value_cents || 0) + (l.mrr_cents || 0) * 12,
    0
  );
  const openPipelineCents = open.reduce(
    (sum, l) => sum + (l.deal_value_cents || 0) + (l.mrr_cents || 0) * 12,
    0
  );
  const closedCount = won.length + lost.length;
  const winRate = closedCount > 0 ? Math.round((won.length / closedCount) * 100) : 0;
  return {
    total: leads.length,
    openCount: open.length,
    wonCount: won.length,
    lostCount: lost.length,
    winRate,
    openWeightedCents,
    openPipelineCents,
    wonRevCents,
  };
}
