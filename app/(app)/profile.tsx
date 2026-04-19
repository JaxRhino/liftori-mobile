/**
 * My Profile — edit avatar, name, nickname, and contact details.
 *
 * Reads the extended profile row (superset of AuthContext.Profile) so
 * we can surface rep_handle / phone / department / personal_email
 * without growing the global auth state. On save we refresh the
 * AuthContext so the greeting on home, chat bubble avatars, and
 * sidebar all pick up the new name/avatar immediately.
 *
 * Avatar upload flow:
 *   1. user taps avatar → bottom sheet with Camera / Library / Remove
 *   2. image picker returns a local URI
 *   3. uploadAvatar() ships bytes to the `avatars` bucket
 *   4. updateMyProfile({ avatar_url }) flips the pointer
 *   5. refreshProfile() re-reads the global subset
 * If step 4 fails we leave the image in storage — a retry just reuses it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  AtSign,
  Building2,
  Camera,
  ImagePlus,
  Mail,
  Phone,
  Shield,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import {
  ExtendedProfile,
  ProfileUpdate,
  deleteAvatarByUrl,
  fetchMyProfile,
  updateMyProfile,
  uploadAvatar,
} from '@/lib/profileService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type FormState = {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  rep_handle: string;
  department: string;
  phone: string;
  personal_email: string;
};

const EMPTY_FORM: FormState = {
  full_name: '',
  first_name: '',
  last_name: '',
  title: '',
  rep_handle: '',
  department: '',
  phone: '',
  personal_email: '',
};

function toForm(p: ExtendedProfile | null): FormState {
  if (!p) return EMPTY_FORM;
  return {
    full_name: p.full_name ?? '',
    first_name: p.first_name ?? '',
    last_name: p.last_name ?? '',
    title: p.title ?? '',
    rep_handle: p.rep_handle ?? '',
    department: p.department ?? '',
    phone: p.phone ?? '',
    personal_email: p.personal_email ?? '',
  };
}

function formDiff(form: FormState, original: ExtendedProfile | null): ProfileUpdate {
  const base = toForm(original);
  const patch: ProfileUpdate = {};
  (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
    if (form[k] !== base[k]) {
      // Persist empty strings as null so the DB doesn't hold on to '' forever
      (patch as Record<string, string | null>)[k] =
        form[k].trim().length === 0 ? null : form[k].trim();
    }
  });
  return patch;
}

function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
    });
  } catch {
    return null;
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const data = await fetchMyProfile();
      setProfile(data);
      setForm(toForm(data));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // ─── Save text fields ─────────────────────────────────────────────
  const dirty = useMemo(() => {
    return Object.keys(formDiff(form, profile)).length > 0;
  }, [form, profile]);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    const patch = formDiff(form, profile);
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      const updated = await updateMyProfile(patch);
      setProfile(updated);
      setForm(toForm(updated));
      await refreshProfile().catch(() => {});
      haptics.success();
    } catch (e: any) {
      haptics.error();
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [dirty, form, profile, refreshProfile, saving]);

  // ─── Avatar handlers ──────────────────────────────────────────────
  const handleAvatarUpload = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        setPickerOpen(false);

        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              'Camera access needed',
              'Enable Camera permission in Settings to take a profile photo.'
            );
            return;
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(
              'Photo access needed',
              'Enable Photos permission in Settings to pick a profile photo.'
            );
            return;
          }
        }

        const res =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.85,
                allowsEditing: true,
                aspect: [1, 1],
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.85,
                allowsEditing: true,
                aspect: [1, 1],
                allowsMultipleSelection: false,
              });
        if (res.canceled) return;
        const asset = res.assets[0];

        setUploading(true);
        const up = await uploadAvatar(asset.uri, {
          filename: asset.fileName ?? undefined,
          mimeType: asset.mimeType ?? undefined,
        });
        const prevUrl = profile?.avatar_url ?? null;
        const updated = await updateMyProfile({ avatar_url: up.url });
        setProfile(updated);
        setForm(toForm(updated));
        await refreshProfile().catch(() => {});
        // Best-effort cleanup of the previous file
        if (prevUrl && prevUrl !== up.url) {
          void deleteAvatarByUrl(prevUrl);
        }
        haptics.success();
      } catch (e: any) {
        haptics.error();
        setError(e?.message || 'Avatar upload failed');
      } finally {
        setUploading(false);
      }
    },
    [profile?.avatar_url, refreshProfile]
  );

  const handleRemoveAvatar = useCallback(async () => {
    try {
      setPickerOpen(false);
      const prevUrl = profile?.avatar_url ?? null;
      if (!prevUrl) return;
      setUploading(true);
      const updated = await updateMyProfile({ avatar_url: null });
      setProfile(updated);
      setForm(toForm(updated));
      await refreshProfile().catch(() => {});
      void deleteAvatarByUrl(prevUrl);
      haptics.success();
    } catch (e: any) {
      haptics.error();
      setError(e?.message || 'Couldn\u2019t remove avatar');
    } finally {
      setUploading(false);
    }
  }, [profile?.avatar_url, refreshProfile]);

  // ─── Derived display values ───────────────────────────────────────
  const displayName =
    profile?.full_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    user?.email ||
    'Liftori member';

  const memberSince = formatMemberSince(profile?.created_at ?? null);

  const roleLabel = useMemo(() => {
    const r = profile?.role;
    if (!r) return null;
    return r.charAt(0).toUpperCase() + r.slice(1);
  }, [profile?.role]);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <SafeScreen bottom="apply">
      <Header
        title="My Profile"
        onBack={() => router.back()}
        bordered
        trailing={
          dirty ? (
            <Pressable
              onPress={save}
              disabled={saving}
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerSave,
                pressed && styles.headerSavePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save profile changes"
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.emerald} />
              ) : (
                <Text style={styles.headerSaveText}>Save</Text>
              )}
            </Pressable>
          ) : undefined
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.emerald} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Avatar hero */}
            <View style={styles.heroCard}>
              <Pressable
                onPress={() => {
                  if (uploading) return;
                  haptics.tap();
                  setPickerOpen(true);
                }}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.avatarWrap,
                  pressed && styles.avatarPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
              >
                <Avatar
                  name={displayName}
                  size="xl"
                  url={profile?.avatar_url ?? undefined}
                />
                <View style={styles.avatarOverlay}>
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Camera size={16} color="#fff" strokeWidth={2.2} />
                  )}
                </View>
              </Pressable>

              <Text style={styles.heroName} numberOfLines={1}>
                {displayName}
              </Text>
              {!!profile?.title && (
                <Text style={styles.heroTitle} numberOfLines={1}>
                  {profile.title}
                </Text>
              )}

              <View style={styles.heroBadges}>
                {roleLabel && (
                  <View style={styles.badge}>
                    <Shield size={12} color={colors.emerald} strokeWidth={2.2} />
                    <Text style={styles.badgeText}>{roleLabel}</Text>
                  </View>
                )}
                {memberSince && (
                  <Text style={styles.heroMeta}>Member since {memberSince}</Text>
                )}
              </View>
            </View>

            {error && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                  onPress={() => setError(null)}
                  hitSlop={8}
                  style={styles.errorClose}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss error"
                >
                  <X size={14} color={colors.textSecondary} strokeWidth={2.2} />
                </Pressable>
              </View>
            )}

            {/* Identity */}
            <SectionHeading>Identity</SectionHeading>
            <View style={styles.card}>
              <Field
                icon={<UserIcon size={18} color={colors.textSecondary} />}
                label="Full name"
                value={form.full_name}
                onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))}
                placeholder="Ryan March"
                autoCapitalize="words"
              />
              <Divider />
              <Field
                icon={<AtSign size={18} color={colors.textSecondary} />}
                label="Nickname / handle"
                value={form.rep_handle}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, rep_handle: v.replace(/\s+/g, '') }))
                }
                placeholder="rhino"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Divider />
              <Field
                icon={<Building2 size={18} color={colors.textSecondary} />}
                label="Title"
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                placeholder="Founder & CEO"
                autoCapitalize="words"
              />
              <Divider />
              <Field
                icon={<Building2 size={18} color={colors.textSecondary} />}
                label="Department"
                value={form.department}
                onChangeText={(v) => setForm((f) => ({ ...f, department: v }))}
                placeholder="Executive"
                autoCapitalize="words"
              />
            </View>

            {/* Contact */}
            <SectionHeading>Contact</SectionHeading>
            <View style={styles.card}>
              <Field
                icon={<Phone size={18} color={colors.textSecondary} />}
                label="Phone"
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                placeholder="(555) 123-4567"
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Divider />
              <Field
                icon={<Mail size={18} color={colors.textSecondary} />}
                label="Personal email"
                value={form.personal_email}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, personal_email: v }))
                }
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Read-only account info */}
            <SectionHeading>Account</SectionHeading>
            <View style={styles.card}>
              <ReadOnlyRow
                icon={<Mail size={18} color={colors.textSecondary} />}
                label="Work email"
                value={profile?.email || user?.email || '—'}
              />
              <Divider />
              <ReadOnlyRow
                icon={<Shield size={18} color={colors.textSecondary} />}
                label="Role"
                value={roleLabel || '—'}
              />
              <Divider />
              <ReadOnlyRow
                icon={<UserIcon size={18} color={colors.textSecondary} />}
                label="User ID"
                value={profile?.id || user?.id || '—'}
                mono
              />
            </View>

            {dirty && (
              <View style={styles.savePinnedWrap}>
                <Button
                  label={saving ? 'Saving…' : 'Save changes'}
                  onPress={save}
                  disabled={saving}
                  loading={saving}
                  variant="primary"
                  size="lg"
                  fullWidth
                />
              </View>
            )}

            <View style={{ height: spacing.xxxl }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Avatar picker sheet */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Profile Photo</Text>
            <Pressable
              onPress={() => handleAvatarUpload('camera')}
              style={({ pressed }) => [
                styles.sheetRow,
                pressed && styles.sheetRowPressed,
              ]}
            >
              <Camera size={20} color={colors.emerald} strokeWidth={2} />
              <Text style={styles.sheetRowText}>Take photo</Text>
            </Pressable>
            <Pressable
              onPress={() => handleAvatarUpload('library')}
              style={({ pressed }) => [
                styles.sheetRow,
                pressed && styles.sheetRowPressed,
              ]}
            >
              <ImagePlus size={20} color={colors.sky} strokeWidth={2} />
              <Text style={styles.sheetRowText}>Choose from library</Text>
            </Pressable>
            {!!profile?.avatar_url && (
              <Pressable
                onPress={handleRemoveAvatar}
                style={({ pressed }) => [
                  styles.sheetRow,
                  pressed && styles.sheetRowPressed,
                ]}
              >
                <Trash2 size={20} color={colors.rose} strokeWidth={2} />
                <Text style={[styles.sheetRowText, styles.sheetRowDanger]}>
                  Remove photo
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setPickerOpen(false)}
              style={({ pressed }) => [
                styles.sheetCancel,
                pressed && styles.sheetRowPressed,
              ]}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}

function Field({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
}: FieldProps) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIcon}>{icon}</View>
      <View style={styles.fieldBody}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
        />
      </View>
    </View>
  );
}

function ReadOnlyRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIcon}>{icon}</View>
      <View style={styles.fieldBody}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text
          style={[styles.readOnlyValue, mono && styles.readOnlyMono]}
          numberOfLines={1}
          selectable
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  headerSave: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerSavePressed: {
    opacity: 0.6,
  },
  headerSaveText: {
    ...typography.bodyMedium,
    color: colors.emerald,
    fontWeight: '700',
  },

  // Hero avatar card
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.surface900,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatarPressed: {
    opacity: 0.8,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface900,
  },
  heroName: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  heroTitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  heroBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.emerald,
  },
  badgeText: {
    ...typography.caption,
    color: colors.emerald,
    fontWeight: '600',
  },
  heroMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Section headings
  sectionHeading: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },

  // Cards
  card: {
    backgroundColor: colors.surface900,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.xxxl + spacing.xs,
  },

  // Field rows
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  fieldIcon: {
    width: 24,
    alignItems: 'center',
  },
  fieldBody: {
    flex: 1,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 2,
  },
  fieldInput: {
    ...typography.body,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
  },
  readOnlyValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  readOnlyMono: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Pinned save button
  savePinnedWrap: {
    marginTop: spacing.md,
  },

  // Error toast card
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rose,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    flex: 1,
    ...typography.caption,
    color: colors.rose,
  },
  errorClose: {
    padding: 2,
  },

  // Bottom sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface900,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  sheetRowPressed: {
    backgroundColor: colors.surface800,
  },
  sheetRowText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  sheetRowDanger: {
    color: colors.rose,
  },
  sheetCancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface800,
  },
  sheetCancelText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
