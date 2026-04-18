/**
 * Settings (Wave 10, mobile).
 *
 * The "admin panel" for the installed app. Three sections:
 *
 *   1. Updates   — channel / runtime / current updateId + two affordances:
 *                  "Check for updates now" (silent fetch) and
 *                  "Reload with latest" (fetch + reloadAsync, confirmed).
 *   2. About     — app version, native build version, OS + device, session
 *                  email. Read-only facts useful when triaging bugs.
 *   3. Roadmap   — placeholders for Appearance / Notification prefs; labeled
 *                  so testers know what's next without guessing.
 *
 * The Updates section is the point of the whole screen — it's the user-
 * visible half of the OTA deploy pipeline. If the channel or updateId ever
 * looks wrong, this is where Ryan (or any tester) confirms the install is
 * on the right track without having to ADB-shell in.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { useRouter } from 'expo-router';
import {
  Bell,
  CircleHelp,
  Info,
  Palette,
  RefreshCw,
  RotateCw,
  User,
  Zap,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import {
  checkForUpdatesSilently,
  currentUpdateInfo,
  forceReloadToLatest,
} from '@/lib/updates';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type InfoRow = {
  label: string;
  value: string;
  mono?: boolean;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [checking, setChecking] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState(() => currentUpdateInfo());

  // Re-snapshot on mount — `currentUpdateInfo()` is static per-launch but
  // useEffect guarantees we don't cache a stale default import.
  useEffect(() => {
    setUpdateInfo(currentUpdateInfo());
  }, []);

  const updatesSection: InfoRow[] = useMemo(
    () => [
      { label: 'Channel', value: updateInfo.channel ?? '—' },
      {
        label: 'Runtime version',
        value: updateInfo.runtimeVersion ?? '—',
        mono: true,
      },
      {
        label: 'Current update',
        value: updateInfo.isEmbeddedLaunch
          ? 'Embedded (APK bundle)'
          : shortId(updateInfo.updateId) ?? 'unknown',
        mono: !updateInfo.isEmbeddedLaunch,
      },
      {
        label: 'Published',
        value: updateInfo.createdAt
          ? new Date(updateInfo.createdAt).toLocaleString()
          : updateInfo.isEmbeddedLaunch
          ? 'At APK build time'
          : '—',
      },
      {
        label: 'OTA enabled',
        value: Updates.isEnabled ? 'Yes' : 'No (dev build)',
      },
    ],
    [updateInfo],
  );

  const aboutSection: InfoRow[] = useMemo(() => {
    const cfg: any = Constants.expoConfig ?? {};
    const appVersion =
      Application.nativeApplicationVersion ?? cfg.version ?? '—';
    const buildVersion =
      Application.nativeBuildVersion ??
      (Platform.OS === 'android'
        ? String(cfg.android?.versionCode ?? '—')
        : String(cfg.ios?.buildNumber ?? '—'));
    const osLine = `${Device.osName ?? Platform.OS} ${
      Device.osVersion ?? Platform.Version ?? ''
    }`.trim();
    const deviceLine = [Device.brand, Device.modelName ?? Device.deviceName]
      .filter(Boolean)
      .join(' ');

    return [
      { label: 'App version', value: appVersion, mono: true },
      { label: 'Native build', value: buildVersion, mono: true },
      { label: 'Expo SDK', value: cfg.sdkVersion ?? '—', mono: true },
      { label: 'OS', value: osLine || '—' },
      { label: 'Device', value: deviceLine || '—' },
      { label: 'Signed in as', value: profile?.email ?? user?.email ?? '—' },
    ];
  }, [profile?.email, user?.email]);

  const handleCheck = useCallback(async () => {
    if (checking || reloading) return;
    haptics.tap();
    setChecking(true);
    try {
      if (!Updates.isEnabled || __DEV__) {
        Alert.alert(
          'OTA unavailable',
          'You are on a development build — updates only apply to installed APKs.',
        );
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        setLastCheck(new Date().toISOString());
        haptics.success();
        Alert.alert(
          'Update staged',
          'A new bundle was downloaded. It will apply automatically on the next cold start — or you can tap "Reload with latest" to apply it now.',
        );
      } else {
        setLastCheck(new Date().toISOString());
        Alert.alert('You are up to date', "There's no newer bundle on this channel right now.");
      }
    } catch (e: any) {
      haptics.error();
      Alert.alert('Check failed', e?.message ?? 'Could not reach the update server.');
    } finally {
      setChecking(false);
    }
  }, [checking, reloading]);

  const handleReload = useCallback(() => {
    if (checking || reloading) return;
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert(
        'OTA unavailable',
        'You are on a development build — reloads only apply to installed APKs with OTA enabled.',
      );
      return;
    }
    haptics.bump();
    Alert.alert(
      'Reload app?',
      'This will fetch the latest bundle and restart immediately. Any unsaved in-memory state will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reload',
          style: 'destructive',
          onPress: async () => {
            setReloading(true);
            try {
              // This function either reloads (success) or surfaces via the
              // console — from the user's POV the app just restarts.
              await forceReloadToLatest();
            } catch (e: any) {
              setReloading(false);
              haptics.error();
              Alert.alert(
                'Reload failed',
                e?.message ?? 'Could not reload. Try again or close and reopen the app.',
              );
            }
          },
        },
      ],
    );
  }, [checking, reloading]);

  return (
    <SafeScreen bottom="skip">
      <Header
        title="Settings"
        subtitle="About this install + update controls"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Updates */}
        <SectionLabel
          icon={<RefreshCw size={12} color={colors.textMuted} />}
          label="Updates"
        />
        <Card variant="flat" style={styles.sectionCard}>
          {updatesSection.map((r, i) => (
            <InfoLine
              key={r.label}
              row={r}
              isLast={i === updatesSection.length - 1}
            />
          ))}
        </Card>
        <View style={styles.btnRow}>
          <Button
            label={checking ? 'Checking…' : 'Check for updates'}
            variant="outline"
            size="sm"
            icon={<RefreshCw size={16} color={colors.textPrimary} />}
            onPress={handleCheck}
            loading={checking}
            disabled={reloading}
            style={styles.btn}
          />
          <Button
            label={reloading ? 'Reloading…' : 'Reload with latest'}
            variant="outline"
            size="sm"
            icon={<RotateCw size={16} color={colors.textPrimary} />}
            onPress={handleReload}
            loading={reloading}
            disabled={checking}
            style={styles.btn}
          />
        </View>
        {lastCheck ? (
          <Text style={styles.helperText}>
            Last checked {new Date(lastCheck).toLocaleTimeString()}
          </Text>
        ) : null}

        {/* About */}
        <SectionLabel
          icon={<Info size={12} color={colors.textMuted} />}
          label="About"
          style={styles.sectionGap}
        />
        <Card variant="flat" style={styles.sectionCard}>
          {aboutSection.map((r, i) => (
            <InfoLine
              key={r.label}
              row={r}
              isLast={i === aboutSection.length - 1}
            />
          ))}
        </Card>

        {/* Roadmap placeholders — transparent about what's coming */}
        <SectionLabel
          icon={<Zap size={12} color={colors.textMuted} />}
          label="Coming soon"
          style={styles.sectionGap}
        />
        <RoadmapRow
          icon={<User size={18} color={colors.emerald} />}
          title="Edit profile"
          subtitle="Avatar, display name, title"
        />
        <RoadmapRow
          icon={<Palette size={18} color={colors.sky} />}
          title="Appearance"
          subtitle="Currently dark-only — theme toggle arrives with Wave 12"
        />
        <RoadmapRow
          icon={<Bell size={18} color={colors.amber} />}
          title="Notification preferences"
          subtitle="Per-type mute + push vs. in-app routing"
        />
        <RoadmapRow
          icon={<CircleHelp size={18} color={colors.purple} />}
          title="Help & Support"
          subtitle="Docs, contact the Liftori team"
        />

        <Text style={styles.footerText}>
          Liftori Mobile · v
          {Application.nativeApplicationVersion ??
            Constants.expoConfig?.version ??
            '0.1.0'}
          {' · '}Wave 10
        </Text>
      </ScrollView>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function SectionLabel({
  icon,
  label,
  style,
}: {
  icon?: React.ReactNode;
  label: string;
  style?: any;
}) {
  return (
    <View style={[styles.sectionLabelRow, style]}>
      {icon}
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function InfoLine({ row, isLast }: { row: InfoRow; isLast: boolean }) {
  return (
    <View
      style={[
        styles.infoLine,
        !isLast && styles.infoLineDivider,
      ]}
    >
      <Text style={styles.infoLabel}>{row.label}</Text>
      <Text
        style={[styles.infoValue, row.mono && styles.infoValueMono]}
        numberOfLines={1}
      >
        {row.value}
      </Text>
    </View>
  );
}

function RoadmapRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card variant="flat" style={styles.roadmapCard}>
      <View style={styles.roadmapInner}>
        <View style={styles.roadmapIcon}>{icon}</View>
        <View style={styles.roadmapText}>
          <Text style={styles.roadmapTitle}>{title}</Text>
          <Text style={styles.roadmapSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.soonPill}>Soon</Text>
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function shortId(id: string | null): string | null {
  if (!id) return null;
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionGap: {
    marginTop: spacing.xl,
  },

  sectionCard: {
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },

  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  infoLineDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.caption,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
  infoValueMono: {
    fontVariant: ['tabular-nums'],
  },

  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: {
    flex: 1,
  },
  helperText: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  roadmapCard: {
    padding: 0,
    marginBottom: spacing.xs,
  },
  roadmapInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  roadmapIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadmapText: {
    flex: 1,
  },
  roadmapTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  roadmapSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  soonPill: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },

  footerText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
  },
});
