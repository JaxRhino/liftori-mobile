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

// ─── Composite ID scheme ────────────────────────────────────────────
// The mobile Work tab surfaces leads from five different tables. Each
// row is tagged with a prefix so `getLead` / mutation helpers can route
// back to the right source. sales_leads keeps the bare UUID for
// backward compatibility with the Create wizard and existing routes.
//
//   prof:<uuid>   → profiles (role = 'customer')       — CRM Pipeline
//   cons:<uuid>   → consulting_appointments            — Consulting Leads
//   labos:<uuid>  → labos_signups                      — LABOS Leads
//   dp:<uuid>     → digital_product_leads              — Digital Product Leads
//   <uuid>        → sales_leads                        — Wizard-created
export type LeadSource =
  | 'sales_leads'
  | 'profiles'
  | 'consulting_appointments'
  | 'labos_signups'
  | 'digital_product_leads';

const ID_PREFIX: Record<Exclude<LeadSource, 'sales_leads'>, string> = {
  profiles: 'prof:',
  consulting_appointments: 'cons:',
  labos_signups: 'labos:',
  digital_product_leads: 'dp:',
};

export function parseLeadId(id: string): { source: LeadSource; rawId: string } {
  if (id.startsWith('prof:'))  return { source: 'profiles',                rawId: id.slice(5) };
  if (id.startsWith('cons:'))  return { source: 'consulting_appointments', rawId: id.slice(5) };
  if (id.startsWith('labos:')) return { source: 'labos_signups',           rawId: id.slice(6) };
  if (id.startsWith('dp:'))    return { source: 'digital_product_leads',   rawId: id.slice(3) };
  return { source: 'sales_leads', rawId: id };
}

// ─── Normalizers ────────────────────────────────────────────────────
// Each of the four non-sales_leads sources gets coerced into the mobile
// Lead shape. Missing fields default to sensible zero/null values so
// the pipeline UI can render without guards. Dollars stored as integers
// in the source tables are converted to cents.

function toCents(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // estimated_value on profiles/consulting_appointments is stored in
  // whole dollars; multiply to cents for consistency with sales_leads.
  return Math.round(n * 100);
}

function coerceSource(raw: unknown): Source | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes('referral'))  return 'referral';
  if (s.includes('affiliate')) return 'affiliate';
  if (s.includes('outbound'))  return 'outbound';
  if (s.includes('inbound'))   return 'inbound';
  if (s.includes('event'))     return 'event';
  if (s.includes('waitlist'))  return 'waitlist';
  return 'other';
}

// profiles.crm_stage uses the web admin's 8-stage pipeline. Map to the
// closest mobile stage per product so Kanban columns still make sense.
function mapProfileStage(crmStage: string | null, product: ProductKey): string {
  const stages = stagesFor(product).map((s) => s.key);
  const fallback = stages[0] || 'discovery';
  if (!crmStage) return fallback;
  switch (crmStage) {
    case 'prospect':
    case 'qualified':
      return stages.includes('discovery')
        ? 'discovery'
        : stages.includes('demo_requested')
        ? 'demo_requested'
        : stages.includes('intro_call')
        ? 'intro_call'
        : fallback;
    case 'proposal':
      return stages.includes('proposal') ? 'proposal'
           : stages.includes('quote')    ? 'quote'
           : fallback;
    case 'negotiation':
      return stages.includes('negotiation') ? 'negotiation'
           : stages.includes('contract')    ? 'contract'
           : fallback;
    case 'won':
    case 'active':
      return 'won';
    case 'at_risk':
      return stages.includes('negotiation') ? 'negotiation' : fallback;
    case 'churned':
      return 'lost';
    default:
      return fallback;
  }
}

function productFromProfileSource(source: string | null): ProductKey {
  if (!source) return 'custom_build';
  const s = source.toLowerCase();
  if (s.includes('consult'))                return 'consulting';
  if (s.includes('labos') || s.includes('os')) return 'labos';
  if (s.includes('digital') || s.includes('product')) return 'custom_build';
  return 'custom_build';
}

type Row = Record<string, any>;

function fromProfile(row: Row): Lead {
  const product = productFromProfileSource(row.source ?? null);
  return {
    id: `${ID_PREFIX.profiles}${row.id}`,
    product_type: product,
    stage: mapProfileStage(row.crm_stage ?? null, product),
    title: row.full_name || row.email || 'Customer',
    company_name: row.company_name ?? null,
    contact_name: row.full_name ?? null,
    contact_email: row.email ?? null,
    contact_phone: row.phone ?? null,
    deal_value_cents: toCents(row.estimated_value),
    mrr_cents: 0,
    probability: typeof row.lead_score === 'number' ? row.lead_score : 50,
    expected_close_date: row.next_follow_up_at ?? null,
    source: coerceSource(row.source),
    assigned_to: null,
    next_action: null,
    next_action_date: row.next_follow_up_at ?? null,
    description: null,
    notes: row.follow_up_notes ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_by: null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    stage_changed_at:
      row.last_activity_at ?? row.updated_at ?? row.created_at ?? new Date().toISOString(),
    assignee: null,
  };
}

function fromConsulting(row: Row): Lead {
  // consulting_appointments doesn't carry a pipeline stage — everyone
  // enters at "intro_call" until a human advances them in the web admin.
  return {
    id: `${ID_PREFIX.consulting_appointments}${row.id}`,
    product_type: 'consulting',
    stage: 'intro_call',
    title:
      row.primary_interest ||
      row.lead_name ||
      row.company_name ||
      'Consulting Inquiry',
    company_name: row.company_name ?? null,
    contact_name: row.lead_name ?? null,
    contact_email: row.lead_email ?? null,
    contact_phone: row.lead_phone ?? null,
    deal_value_cents: toCents(row.estimated_value),
    mrr_cents: 0,
    probability: 50,
    expected_close_date: row.next_follow_up_at ?? null,
    source: 'inbound',
    assigned_to: null,
    next_action: row.biggest_challenge ?? null,
    next_action_date: row.next_follow_up_at ?? null,
    description: row.biggest_challenge ?? null,
    notes: row.follow_up_notes ?? null,
    tags: [],
    created_by: null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    stage_changed_at:
      row.updated_at ?? row.created_at ?? new Date().toISOString(),
    assignee: null,
  };
}

function fromLabos(row: Row): Lead {
  return {
    id: `${ID_PREFIX.labos_signups}${row.id}`,
    product_type: 'labos',
    stage: 'demo_requested',
    title: row.company_name || row.full_name || row.email || 'LABOS Signup',
    company_name: row.company_name ?? null,
    contact_name: row.full_name ?? null,
    contact_email: row.email ?? null,
    contact_phone: row.phone ?? null,
    deal_value_cents: 0,
    mrr_cents: 0,
    probability: 50,
    expected_close_date: null,
    source: 'inbound',
    assigned_to: null,
    next_action: null,
    next_action_date: null,
    description: row.use_case ?? row.notes ?? null,
    notes: row.notes ?? null,
    tags: [],
    created_by: null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    stage_changed_at:
      row.updated_at ?? row.created_at ?? new Date().toISOString(),
    assignee: null,
  };
}

function fromDigitalProduct(row: Row): Lead {
  return {
    id: `${ID_PREFIX.digital_product_leads}${row.id}`,
    product_type: 'custom_build',
    stage: 'discovery',
    title:
      row.product_name ||
      row.customer_name ||
      row.customer_email ||
      'Digital Product Lead',
    company_name: row.company_name ?? null,
    contact_name: row.customer_name ?? null,
    contact_email: row.customer_email ?? null,
    contact_phone: row.customer_phone ?? null,
    deal_value_cents: toCents(row.estimated_value ?? row.budget),
    mrr_cents: 0,
    probability: 50,
    expected_close_date: null,
    source: 'inbound',
    assigned_to: null,
    next_action: null,
    next_action_date: null,
    description: row.product_description ?? row.notes ?? null,
    notes: row.notes ?? null,
    tags: [],
    created_by: null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    stage_changed_at:
      row.updated_at ?? row.created_at ?? new Date().toISOString(),
    assignee: null,
  };
}

// ─── Aggregated list ────────────────────────────────────────────────
/**
 * Unified pipeline view — reads from every CRM source the web admin
 * surfaces (profiles + 3 lead tables) plus the legacy `sales_leads`
 * table used by the mobile Create wizard. A source's failure is logged
 * but does not tear down the whole list; the remaining sources still
 * render. This keeps the Work tab resilient to schema drift.
 */
export async function listLeads(opts: ListOpts = {}): Promise<Lead[]> {
  const wantProduct = opts.productType;

  const canSkip = (product: ProductKey) =>
    wantProduct != null && wantProduct !== product;

  // sales_leads — legacy / wizard-created
  const pSales = (async () => {
    try {
      let q = supabase
        .from('sales_leads')
        .select('*, assignee:assigned_to (id, full_name, email, avatar_url)')
        .order('stage_changed_at', { ascending: false });
      if (wantProduct) q = q.eq('product_type', wantProduct);
      if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Lead[]) || [];
    } catch (e) {
      console.warn('[leadsService.listLeads] sales_leads failed:', e);
      return [] as Lead[];
    }
  })();

  // profiles (CRM Pipeline) — mixed product types, derived from `source`
  const pProfiles = (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'customer')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(fromProfile);
    } catch (e) {
      console.warn('[leadsService.listLeads] profiles failed:', e);
      return [] as Lead[];
    }
  })();

  // consulting_appointments → product_type='consulting'
  const pConsulting = canSkip('consulting')
    ? Promise.resolve([] as Lead[])
    : (async () => {
        try {
          const { data, error } = await supabase
            .from('consulting_appointments')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) throw error;
          return (data || []).map(fromConsulting);
        } catch (e) {
          console.warn('[leadsService.listLeads] consulting_appointments failed:', e);
          return [] as Lead[];
        }
      })();

  // labos_signups → product_type='labos'
  const pLabos = canSkip('labos')
    ? Promise.resolve([] as Lead[])
    : (async () => {
        try {
          const { data, error } = await supabase
            .from('labos_signups')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) throw error;
          return (data || []).map(fromLabos);
        } catch (e) {
          console.warn('[leadsService.listLeads] labos_signups failed:', e);
          return [] as Lead[];
        }
      })();

  // digital_product_leads → product_type='custom_build'
  const pDigital = canSkip('custom_build')
    ? Promise.resolve([] as Lead[])
    : (async () => {
        try {
          const { data, error } = await supabase
            .from('digital_product_leads')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) throw error;
          return (data || []).map(fromDigitalProduct);
        } catch (e) {
          console.warn('[leadsService.listLeads] digital_product_leads failed:', e);
          return [] as Lead[];
        }
      })();

  const [sales, profs, cons, labos, dp] = await Promise.all([
    pSales, pProfiles, pConsulting, pLabos, pDigital,
  ]);

  let merged: Lead[] = [...sales, ...profs, ...cons, ...labos, ...dp];

  // Post-merge filters (profiles filter runs here because we can't
  // filter on derived product_type at the SQL level).
  if (wantProduct)              merged = merged.filter((l) => l.product_type === wantProduct);
  if (opts.stage)               merged = merged.filter((l) => l.stage === opts.stage);
  if (opts.assignedTo)          merged = merged.filter((l) => l.assigned_to === opts.assignedTo);
  if (opts.includeClosed === false) merged = merged.filter((l) => !isClosedStage(l.stage));

  merged.sort((a, b) => {
    const ta = new Date(a.stage_changed_at || a.updated_at || a.created_at).getTime();
    const tb = new Date(b.stage_changed_at || b.updated_at || b.created_at).getTime();
    return tb - ta;
  });

  return merged;
}

export async function getLead(id: string): Promise<Lead> {
  const { source, rawId } = parseLeadId(id);

  if (source === 'sales_leads') {
    const { data, error } = await supabase
      .from('sales_leads')
      .select('*, assignee:assigned_to (id, full_name, email, avatar_url)')
      .eq('id', rawId)
      .single();
    if (error) err(error, 'getLead');
    return data as Lead;
  }

  // Non-sales_leads sources are read-only from the mobile detail
  // screen. Fetch the raw row and normalize on the way out so the
  // detail view renders with the same shape as a sales_leads lead.
  const { data, error } = await supabase.from(source).select('*').eq('id', rawId).single();
  if (error) err(error, `getLead(${source})`);
  switch (source) {
    case 'profiles':                return fromProfile(data as Row);
    case 'consulting_appointments': return fromConsulting(data as Row);
    case 'labos_signups':           return fromLabos(data as Row);
    case 'digital_product_leads':   return fromDigitalProduct(data as Row);
    default: {
      const _exhaustive: never = source;
      throw new Error(`getLead: unhandled source ${_exhaustive}`);
    }
  }
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

/** True for IDs that point at the legacy sales_leads table. Mutations
 *  are currently only supported on that source — rows surfaced from
 *  profiles / consulting_appointments / labos_signups /
 *  digital_product_leads are read-only on mobile and must be edited in
 *  the web admin (or a future per-source mutation helper). */
export function isMutableLead(id: string): boolean {
  return parseLeadId(id).source === 'sales_leads';
}

export async function updateLead(id: string, patch: Partial<CreateLeadInput> & Record<string, unknown>): Promise<Lead> {
  const { source, rawId } = parseLeadId(id);
  if (source !== 'sales_leads') {
    throw new Error(
      `updateLead: ${source} rows are read-only on mobile. Edit this lead in the web admin.`,
    );
  }
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
    .eq('id', rawId)
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
  const { source, rawId } = parseLeadId(id);
  if (source !== 'sales_leads') {
    throw new Error(
      `deleteLead: ${source} rows cannot be deleted from mobile. Remove the row in the web admin.`,
    );
  }
  const { error } = await supabase.from('sales_leads').delete().eq('id', rawId);
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
