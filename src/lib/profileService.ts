/**
 * profileService — extended CRUD for the `profiles` row behind the
 * current signed-in user. The AuthContext selects a narrow 6-field
 * subset (id, email, full_name, role, avatar_url, title) for its global
 * state; this service reads + writes a larger set so the My Profile
 * screen can surface things like phone, nickname (rep_handle),
 * personal_email, department, etc.
 *
 * All writes go to the row where `id = auth.uid()` — callers should
 * never have to pass the user ID, we resolve it from `supabase.auth`.
 * After a successful write the caller should invoke
 * `AuthContext.refreshProfile()` so the app's avatar/name stays in
 * sync across the session.
 *
 * Avatar uploads land in the `avatars` public bucket under
 * `{userId}/{timestamp}.{ext}`. The bucket is public so the
 * resulting URL can be rendered anywhere (chat bubbles, home greeting,
 * etc.) without a signed-URL dance.
 */
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

/**
 * ExtendedProfile — superset of AuthContext.Profile. Every field beyond
 * the core 6 is nullable; the DB allows nulls and older team members
 * may never have set them.
 */
export interface ExtendedProfile {
  // Core identity
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  updated_at: string | null;

  // Display
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  avatar_url: string | null;
  rep_handle: string | null;
  department: string | null;

  // Contact
  phone: string | null;
  personal_email: string | null;
}

/**
 * Subset of ExtendedProfile that the user can actually edit from the
 * mobile My Profile screen. Excludes system-managed fields (id, email,
 * role, timestamps).
 */
export type ProfileUpdate = Partial<
  Pick<
    ExtendedProfile,
    | 'full_name'
    | 'first_name'
    | 'last_name'
    | 'title'
    | 'avatar_url'
    | 'rep_handle'
    | 'department'
    | 'phone'
    | 'personal_email'
  >
>;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const EXTENDED_SELECT =
  'id, email, role, created_at, updated_at, full_name, first_name, last_name, title, avatar_url, rep_handle, department, phone, personal_email';

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

/**
 * Fetch the extended profile for the currently signed-in user.
 * Returns `null` if no row exists (shouldn't happen — a trigger creates
 * a profile row on signup — but we guard anyway).
 */
export async function fetchMyProfile(): Promise<ExtendedProfile | null> {
  try {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select(EXTENDED_SELECT)
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as ExtendedProfile) ?? null;
  } catch (e) {
    fail(e, 'fetchMyProfile');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════════

/**
 * Update the signed-in user's profile row with a partial field set.
 * Always enforces `id = auth.uid()` so this can't leak into other rows.
 * Returns the updated ExtendedProfile.
 */
export async function updateMyProfile(
  fields: ProfileUpdate
): Promise<ExtendedProfile> {
  try {
    const userId = await currentUserId();

    // Strip undefined — we don't want to overwrite fields with NULL
    // unless the caller explicitly passed null.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    // Touch updated_at so the sort still makes sense
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select(EXTENDED_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Profile row not found');
    return data as ExtendedProfile;
  } catch (e) {
    fail(e, 'updateMyProfile');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Avatar upload
// ═══════════════════════════════════════════════════════════════════════

export interface AvatarUploadResult {
  url: string;
  path: string;
  size: number;
}

/**
 * Upload a local image URI (from expo-image-picker) to the `avatars`
 * bucket and return a public URL.
 *
 * Mirrors the chat-files upload pattern: read the file via `fetch()` →
 * `arrayBuffer()` because React Native's Blob path silently ships a
 * 0-byte file on iOS. Paths namespace by user id so each team member
 * only sees their own history.
 *
 * Does NOT update the `profiles.avatar_url` column — callers should
 * call `updateMyProfile({ avatar_url: result.url })` afterwards. Keeps
 * the upload step rollback-safe (if the DB write fails, the image is
 * still in storage for a retry).
 */
export async function uploadAvatar(
  localUri: string,
  opts: { filename?: string; mimeType?: string } = {}
): Promise<AvatarUploadResult> {
  try {
    const userId = await currentUserId();

    const urlPath = localUri.split('?')[0];
    const inferredName = urlPath.split('/').pop() || `avatar-${Date.now()}.jpg`;
    const filename = opts.filename || inferredName;
    const extFromName = filename.includes('.')
      ? (filename.split('.').pop() || 'jpg')
      : 'jpg';
    const ext = extFromName.toLowerCase();
    const mimeType =
      opts.mimeType ||
      (ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'heic' || ext === 'heif'
            ? 'image/heic'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg');

    const resp = await fetch(localUri);
    if (!resp.ok) throw new Error(`Couldn't read image (${resp.status})`);
    const arrayBuf = await resp.arrayBuffer();
    const size = arrayBuf.byteLength;

    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuf, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '3600',
      });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return { url: pub.publicUrl, path, size };
  } catch (e) {
    fail(e, 'uploadAvatar');
  }
}

/**
 * Best-effort: remove an older avatar file once we've rolled forward
 * to a new URL. We only delete files under the current user's prefix
 * (`{userId}/…`) to avoid ever reaching across tenants.
 */
export async function deleteAvatarByUrl(url: string): Promise<void> {
  try {
    const userId = await currentUserId();
    // Public URLs look like `.../storage/v1/object/public/avatars/<path>`
    const marker = '/public/avatars/';
    const idx = url.indexOf(marker);
    if (idx < 0) return;
    const path = url.slice(idx + marker.length);
    if (!path.startsWith(`${userId}/`)) return;
    await supabase.storage.from('avatars').remove([path]);
  } catch {
    /* best-effort */
  }
}
