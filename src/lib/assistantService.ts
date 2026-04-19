/**
 * assistantService — Sage AI assistant (mobile)
 *
 * Thin wrapper around:
 *   - `assistant_threads` — per-user conversation threads
 *   - `assistant_messages` — messages in each thread
 *   - `assistant_memories` — long-lived facts the assistant remembers
 *   - edge function `assistant-chat` — runs the tool-calling loop and
 *     returns the assistant's next reply.
 *
 * RLS enforces per-user access on all three tables. The edge function also
 * scopes tool executions to the user via the Authorization header, so this
 * service never needs to pass a user_id explicitly.
 */
import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────────
export interface AssistantThread {
  id: string;
  user_id: string;
  title: string;
  last_message_preview: string | null;
  message_count: number;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type AssistantMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AssistantMessage {
  id: string;
  thread_id: string;
  user_id: string;
  role: AssistantMessageRole;
  content: string;
  tool_calls: AssistantToolCall[] | null;
  tool_results: any[] | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
}

export interface AssistantToolCall {
  name: string;
  input: Record<string, any>;
}

export type MemoryKind = 'preference' | 'fact' | 'reminder' | 'goal' | 'context';

export interface AssistantMemory {
  id: string;
  user_id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  importance: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendMessageResponse {
  threadId: string;
  reply: string;
  toolsUsed: AssistantToolCall[];
  usage?: { tokens_in: number; tokens_out: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────
function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[assistantService] ${label}:`, e);
  throw e;
}

function toThread(row: any): AssistantThread {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || 'Untitled',
    last_message_preview: row.last_message_preview ?? null,
    message_count: row.message_count ?? 0,
    pinned: !!row.pinned,
    archived: !!row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toMessage(row: any): AssistantMessage {
  return {
    id: row.id,
    thread_id: row.thread_id,
    user_id: row.user_id,
    role: row.role,
    content: row.content ?? '',
    tool_calls: Array.isArray(row.tool_calls) ? row.tool_calls : null,
    tool_results: Array.isArray(row.tool_results) ? row.tool_results : null,
    model: row.model ?? null,
    tokens_in: row.tokens_in ?? null,
    tokens_out: row.tokens_out ?? null,
    created_at: row.created_at,
  };
}

function toMemory(row: any): AssistantMemory {
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    importance: row.importance ?? 5,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─── Threads ────────────────────────────────────────────────────────────
export async function listThreads(): Promise<AssistantThread[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_threads')
      .select('*')
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map(toThread);
  } catch (e) {
    err(e, 'listThreads');
  }
}

export async function fetchThread(id: string): Promise<AssistantThread | null> {
  try {
    const { data, error } = await supabase
      .from('assistant_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toThread(data) : null;
  } catch (e) {
    err(e, 'fetchThread');
  }
}

export async function createThread(title = 'New conversation'): Promise<AssistantThread> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('assistant_threads')
      .insert({ user_id: auth.user.id, title })
      .select('*')
      .single();
    if (error) throw error;
    return toThread(data);
  } catch (e) {
    err(e, 'createThread');
  }
}

export async function renameThread(id: string, title: string): Promise<void> {
  try {
    const { error } = await supabase.from('assistant_threads').update({ title }).eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'renameThread');
  }
}

export async function togglePinThread(id: string, pinned: boolean): Promise<void> {
  try {
    const { error } = await supabase.from('assistant_threads').update({ pinned }).eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'togglePinThread');
  }
}

export async function archiveThread(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('assistant_threads').update({ archived: true }).eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'archiveThread');
  }
}

export async function deleteThread(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('assistant_threads').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteThread');
  }
}

// ─── Messages ───────────────────────────────────────────────────────────
export async function listMessages(threadId: string): Promise<AssistantMessage[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    return (data || []).map(toMessage);
  } catch (e) {
    err(e, 'listMessages');
  }
}

/**
 * Send a user message and get the assistant's reply.
 * The edge function persists both the user message and the assistant reply,
 * so after this resolves the caller should re-fetch the message list.
 *
 * Pass `threadId = null` to start a new thread; the response includes the
 * new thread id.
 */
export async function sendMessage(
  threadId: string | null,
  userMessage: string,
): Promise<SendMessageResponse> {
  try {
    // Explicitly pull the current access token and pass it as Authorization.
    // Supabase-js v2 normally attaches this automatically for functions.invoke,
    // but on cold-started mobile clients we've seen the auto-attach miss and
    // the platform's verify_jwt gateway then 401s the request. Forcing the
    // header removes the ambiguity.
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) throw new Error('Not signed in — please log out and back in');

    const { data, error } = await supabase.functions.invoke<SendMessageResponse>('assistant-chat', {
      body: { threadId, userMessage },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (!data) throw new Error('No response from assistant');
    return data;
  } catch (e) {
    err(e, 'sendMessage');
  }
}

// ─── Memories ───────────────────────────────────────────────────────────
export async function listMemories(): Promise<AssistantMemory[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_memories')
      .select('*')
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data || []).map(toMemory);
  } catch (e) {
    err(e, 'listMemories');
  }
}

export interface CreateMemoryInput {
  kind: MemoryKind;
  title: string;
  content: string;
  importance?: number;
}

export async function createMemory(input: CreateMemoryInput): Promise<AssistantMemory> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('Not authenticated');
    const payload = {
      user_id: auth.user.id,
      kind: input.kind,
      title: input.title,
      content: input.content,
      importance: input.importance ?? 5,
    };
    const { data, error } = await supabase
      .from('assistant_memories')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return toMemory(data);
  } catch (e) {
    err(e, 'createMemory');
  }
}

export async function deleteMemory(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('assistant_memories').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    err(e, 'deleteMemory');
  }
}

// ─── Formatting helpers ─────────────────────────────────────────────────
export function formatRelativeTime(iso: string | null): string {
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
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function toolLabel(name: string): string {
  switch (name) {
    case 'create_calendar_event': return 'Calendar event';
    case 'create_task': return 'Task';
    case 'create_note': return 'Note';
    case 'create_sales_lead': return 'Sales lead';
    case 'log_customer_activity': return 'Customer activity';
    case 'save_memory': return 'Memory saved';
    case 'search_customers': return 'Searched customers';
    case 'search_sales_leads': return 'Searched leads';
    default: return name;
  }
}

export const MEMORY_KINDS: { key: MemoryKind; label: string; hex: string }[] = [
  { key: 'preference', label: 'Preference', hex: '#a855f7' },
  { key: 'fact',       label: 'Fact',       hex: '#0ea5e9' },
  { key: 'goal',       label: 'Goal',       hex: '#10b981' },
  { key: 'reminder',   label: 'Reminder',   hex: '#f59e0b' },
  { key: 'context',    label: 'Context',    hex: '#6366f1' },
];

export function memoryKindMeta(kind: MemoryKind) {
  return MEMORY_KINDS.find((k) => k.key === kind) || MEMORY_KINDS[0];
}
