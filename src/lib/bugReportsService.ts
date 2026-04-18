/**
 * bugReportsService — Liftori's team-facing bug reports (mobile).
 *
 * Distinct from `support_tickets` (which is customer → team). This surface
 * is team/tester → internal triage: file-from-the-field capture with auto
 * device info so debugging isn't "works on my machine" guesswork.
 *
 * RLS on `bug_reports`:
 *   • reporters INSERT rows where reporter_id = auth.uid()
 *   • reporters SELECT their own rows
 *   • admins SELECT/UPDATE/DELETE all rows (via is_admin())
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugCategory = 'crash' | 'ui' | 'data' | 'performance' | 'auth' | 'other';
export type BugStatus =
  | 'new'
  | 'triaging'
  | 'confirmed'
  | 'in_progress'
  | 'fixed'
  | 'wont_fix'
  | 'duplicate';

export interface DeviceInfo {
  platform: string;
  os: string | null;
  osVersion: string | null;
  deviceName: string | null;
  modelName: string | null;
  brand: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  expoSdk: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  channel: string | null;
  isDevice: boolean;
}

export interface BugReport {
  id: string;
  reporter_id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  category: BugCategory;
  surface: string;
  status: BugStatus;
  device_info: DeviceInfo | Record<string, unknown>;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  screenshot_url: string | null;
  assigned_to: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewBugReport {
  title: string;
  description: string;
  severity: BugSeverity;
  category: BugCategory;
  steps_to_reproduce?: string | null;
  expected_behavior?: string | null;
  actual_behavior?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function err(e: unknown, label: string): never {
  // eslint-disable-next-line no-console
  console.error(`[bugReportsService] ${label}:`, e);
  throw e;
}

/**
 * Snapshot everything we can get from the runtime without requiring extra
 * permissions. Called at submit time so the report captures the exact build
 * the user was on when they hit the bug — critical for OTA builds where the
 * JS bundle can drift ahead of the APK version.
 */
export function captureDeviceInfo(): DeviceInfo {
  const cfg: any = Constants.expoConfig ?? {};
  const updates: any = (Updates as any) ?? {};
  return {
    platform: Platform.OS,
    os: Device.osName ?? Platform.OS,
    osVersion: Device.osVersion ?? String(Platform.Version ?? ''),
    deviceName: Device.deviceName ?? null,
    modelName: Device.modelName ?? null,
    brand: Device.brand ?? null,
    appVersion: cfg.version ?? null,
    buildNumber:
      (Platform.OS === 'android'
        ? cfg.android?.versionCode
        : cfg.ios?.buildNumber) ?? null,
    expoSdk: cfg.sdkVersion ?? null,
    runtimeVersion:
      typeof updates.runtimeVersion === 'string' ? updates.runtimeVersion : null,
    updateId: typeof updates.updateId === 'string' ? updates.updateId : null,
    channel: typeof updates.channel === 'string' ? updates.channel : null,
    isDevice: Device.isDevice,
  };
}

// ─── Write ──────────────────────────────────────────────────────────

/**
 * Submit a new bug report. The reporter_id is resolved from the session so
 * the caller doesn't have to pass it — RLS enforces the match anyway.
 */
export async function submitBugReport(input: NewBugReport): Promise<BugReport> {
  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!user) throw new Error('Not signed in');

    const row = {
      reporter_id: user.id,
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      category: input.category,
      surface: 'mobile',
      device_info: captureDeviceInfo(),
      steps_to_reproduce: input.steps_to_reproduce?.trim() || null,
      expected_behavior: input.expected_behavior?.trim() || null,
      actual_behavior: input.actual_behavior?.trim() || null,
    };

    const { data, error } = await supabase
      .from('bug_reports')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as BugReport;
  } catch (e) {
    err(e, 'submitBugReport');
  }
}

// ─── Read ───────────────────────────────────────────────────────────

/**
 * Most recent bug reports filed by the signed-in user. Admins see everyone
 * they have access to via RLS; non-admins see only their own.
 */
export async function fetchMyBugReports(limit = 30): Promise<BugReport[]> {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as BugReport[]) || [];
  } catch (e) {
    err(e, 'fetchMyBugReports');
  }
}

// ─── UI helpers ─────────────────────────────────────────────────────

export const SEVERITY_LABEL: Record<BugSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const CATEGORY_LABEL: Record<BugCategory, string> = {
  crash: 'Crash',
  ui: 'UI / Layout',
  data: 'Wrong data',
  performance: 'Performance',
  auth: 'Auth / Login',
  other: 'Other',
};

export const STATUS_LABEL: Record<BugStatus, string> = {
  new: 'New',
  triaging: 'Triaging',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  fixed: 'Fixed',
  wont_fix: "Won't fix",
  duplicate: 'Duplicate',
};
