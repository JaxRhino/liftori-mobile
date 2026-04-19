/**
 * orgDocumentsService — Company documents library (mobile)
 *
 * Reads `org_documents` scoped to the viewer's org_id (RLS enforces this
 * server-side anyway — `user_belongs_to_org(org_id)`). Supports category
 * filter, search, tag filter.
 *
 * Files are served as public URLs or Supabase Storage signed URLs depending
 * on how they were uploaded by the web admin. The mobile app opens them via
 * Linking.openURL to keep the build OTA-safe (no native PDF viewer dep).
 */
import { supabase } from './supabase';

export type DocCategory =
  | 'general'
  | 'training'
  | 'marketing'
  | 'safety'
  | 'insurance'
  | 'license'
  | 'contract_template'
  | 'employee'
  | 'financial'
  | 'legal';

export interface DocCategoryMeta {
  key: DocCategory;
  label: string;
  hex: string;
  icon:
    | 'file-text'
    | 'graduation-cap'
    | 'megaphone'
    | 'shield-check'
    | 'shield'
    | 'award'
    | 'file-signature'
    | 'users'
    | 'dollar-sign'
    | 'scale';
}

export const DOC_CATEGORIES: DocCategoryMeta[] = [
  { key: 'general',           label: 'General',     hex: '#64748b', icon: 'file-text' },
  { key: 'training',          label: 'Training',    hex: '#10b981', icon: 'graduation-cap' },
  { key: 'marketing',         label: 'Marketing',   hex: '#a855f7', icon: 'megaphone' },
  { key: 'safety',            label: 'Safety',      hex: '#f43f5e', icon: 'shield-check' },
  { key: 'insurance',         label: 'Insurance',   hex: '#0ea5e9', icon: 'shield' },
  { key: 'license',           label: 'License',     hex: '#f59e0b', icon: 'award' },
  { key: 'contract_template', label: 'Contracts',   hex: '#6366f1', icon: 'file-signature' },
  { key: 'employee',          label: 'HR / People', hex: '#14b8a6', icon: 'users' },
  { key: 'financial',         label: 'Financial',   hex: '#059669', icon: 'dollar-sign' },
  { key: 'legal',             label: 'Legal',       hex: '#ef4444', icon: 'scale' },
];

export function categoryMeta(key: string | null | undefined): DocCategoryMeta {
  return DOC_CATEGORIES.find((c) => c.key === key) || DOC_CATEGORIES[0];
}

export type DocVisibility = 'team' | 'private' | 'public' | 'admin';

export interface OrgDocument {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  category: DocCategory;
  tags: string[];
  visibility: DocVisibility;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[orgDocumentsService] ${label}:`, e);
  throw e;
}

function toDoc(row: any): OrgDocument {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    description: row.description ?? null,
    file_url: row.file_url ?? null,
    file_type: row.file_type ?? null,
    file_size: row.file_size ?? null,
    category: (row.category as DocCategory) || 'general',
    tags: Array.isArray(row.tags) ? row.tags : [],
    visibility: (row.visibility as DocVisibility) || 'team',
    uploaded_by: row.uploaded_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface ListDocsOptions {
  category?: DocCategory | 'all';
  search?: string;
  limit?: number;
}

export async function listOrgDocuments(opts: ListDocsOptions = {}): Promise<OrgDocument[]> {
  try {
    let q = supabase
      .from('org_documents')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false });

    if (opts.category && opts.category !== 'all') q = q.eq('category', opts.category);
    if (opts.search && opts.search.trim()) {
      const s = opts.search.trim().replace(/[,%]/g, ' ');
      q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
    }
    if (opts.limit) q = q.limit(opts.limit);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(toDoc);
  } catch (e) {
    err(e, 'listOrgDocuments');
  }
}

export async function fetchOrgDocument(id: string): Promise<OrgDocument | null> {
  try {
    const { data, error } = await supabase
      .from('org_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toDoc(data) : null;
  } catch (e) {
    err(e, 'fetchOrgDocument');
  }
}

export async function deleteOrgDocument(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('org_documents').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteOrgDocument');
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function extensionOf(doc: OrgDocument): string {
  if (doc.file_type) return doc.file_type.toLowerCase();
  if (!doc.file_url) return '';
  const match = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(doc.file_url);
  return match ? match[1].toLowerCase() : '';
}

export function isPdf(doc: OrgDocument): boolean {
  const ext = extensionOf(doc);
  return ext === 'pdf' || (doc.file_type ?? '').includes('pdf');
}

export function isImage(doc: OrgDocument): boolean {
  const ext = extensionOf(doc);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext);
}

export function formatUpdatedLabel(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
