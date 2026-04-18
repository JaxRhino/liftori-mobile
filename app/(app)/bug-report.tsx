/**
 * Bug Report (Wave 9, mobile).
 *
 * Field-side bug capture for the Liftori team. Separate from customer
 * support tickets — this is "team member sees something broken, files it
 * immediately with device context attached" so triage isn't guesswork.
 *
 * Flow:
 *   • Required: title + description
 *   • Severity chip row (low / medium / high / critical)
 *   • Category chip row (crash / ui / data / performance / auth / other)
 *   • Optional expandable detail: steps / expected / actual
 *   • Device info is auto-captured at submit time — users don't type it
 *   • Submit → haptics.success + Alert + router.back() to More
 *
 * A small "Your recent reports" list at the bottom shows the last few rows
 * the user filed, each with a status pill, so they know the report landed
 * and can track triage without opening the desktop.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Bug,
  ChevronDown,
  ChevronUp,
  Info,
  Send,
  Smartphone,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import {
  BugCategory,
  BugReport,
  BugSeverity,
  BugStatus,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  captureDeviceInfo,
  fetchMyBugReports,
  submitBugReport,
} from '@/lib/bugReportsService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

const SEVERITIES: BugSeverity[] = ['low', 'medium', 'high', 'critical'];
const CATEGORIES: BugCategory[] = [
  'crash',
  'ui',
  'data',
  'performance',
  'auth',
  'other',
];

const SEVERITY_TINT: Record<BugSeverity, string> = {
  low: colors.textMuted,
  medium: colors.sky,
  high: colors.amber,
  critical: colors.rose,
};

const STATUS_TINT: Record<BugStatus, string> = {
  new: colors.sky,
  triaging: colors.amber,
  confirmed: colors.amber,
  in_progress: colors.emerald,
  fixed: colors.emerald,
  wont_fix: colors.textMuted,
  duplicate: colors.textMuted,
};

export default function BugReportScreen() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('medium');
  const [category, setCategory] = useState<BugCategory>('other');
  const [showDetails, setShowDetails] = useState(false);
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [recent, setRecent] = useState<BugReport[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const device = useMemo(() => captureDeviceInfo(), []);

  const loadRecent = useCallback(async () => {
    try {
      const rows = await fetchMyBugReports(5);
      setRecent(rows);
    } catch {
      // non-fatal — keep whatever's there
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const canSubmit =
    title.trim().length >= 3 && description.trim().length >= 5 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitBugReport({
        title,
        description,
        severity,
        category,
        steps_to_reproduce: showDetails ? steps : null,
        expected_behavior: showDetails ? expected : null,
        actual_behavior: showDetails ? actual : null,
      });
      haptics.success();
      Alert.alert(
        'Report filed',
        'Thanks — the Liftori team has it and will triage shortly.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset + refresh the "recent" list so the new row shows up
              setTitle('');
              setDescription('');
              setSeverity('medium');
              setCategory('other');
              setShowDetails(false);
              setSteps('');
              setExpected('');
              setActual('');
              void loadRecent();
            },
          },
        ],
      );
    } catch (e: any) {
      haptics.error();
      Alert.alert(
        'Could not submit',
        e?.message ?? 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    title,
    description,
    severity,
    category,
    showDetails,
    steps,
    expected,
    actual,
    loadRecent,
  ]);

  return (
    <SafeScreen bottom="skip">
      <Header
        title="Report a bug"
        subtitle="Field-side capture with device info"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Bug size={18} color={colors.amber} />
          </View>
          <Text style={styles.bannerText}>
            Found something broken? Describe what you saw — we'll attach your
            device + build info automatically.
          </Text>
        </View>

        {/* Title */}
        <Input
          label="Title"
          placeholder="Short summary, e.g. 'Clock out button crashes'"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />

        {/* Description */}
        <Input
          label="What happened?"
          placeholder="Describe the issue in a sentence or two."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          containerStyle={styles.gap}
        />

        {/* Severity */}
        <Text style={styles.sectionLabel}>Severity</Text>
        <View style={styles.chipRow}>
          {SEVERITIES.map((s) => {
            const active = severity === s;
            return (
              <Pressable
                key={s}
                onPress={() => {
                  haptics.tap();
                  setSeverity(s);
                }}
                style={[
                  styles.chip,
                  active && {
                    backgroundColor: SEVERITY_TINT[s] + '22',
                    borderColor: SEVERITY_TINT[s],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && { color: SEVERITY_TINT[s], fontWeight: '700' },
                  ]}
                >
                  {SEVERITY_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Category */}
        <Text style={[styles.sectionLabel, styles.gap]}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  haptics.tap();
                  setCategory(c);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {CATEGORY_LABEL[c]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Optional details — collapsed by default */}
        <Pressable
          onPress={() => {
            haptics.tap();
            setShowDetails((v) => !v);
          }}
          style={styles.detailsToggle}
        >
          {showDetails ? (
            <ChevronUp size={16} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={16} color={colors.textSecondary} />
          )}
          <Text style={styles.detailsToggleText}>
            {showDetails ? 'Hide optional details' : 'Add steps / expected / actual (optional)'}
          </Text>
        </Pressable>

        {showDetails ? (
          <View>
            <Input
              label="Steps to reproduce"
              placeholder={'1. Open Pulse\n2. Tap Clock out\n3. …'}
              value={steps}
              onChangeText={setSteps}
              multiline
              numberOfLines={3}
              containerStyle={styles.gap}
            />
            <Input
              label="Expected"
              placeholder="What should have happened?"
              value={expected}
              onChangeText={setExpected}
              multiline
              numberOfLines={2}
              containerStyle={styles.gap}
            />
            <Input
              label="Actual"
              placeholder="What actually happened?"
              value={actual}
              onChangeText={setActual}
              multiline
              numberOfLines={2}
              containerStyle={styles.gap}
            />
          </View>
        ) : null}

        {/* Device preview */}
        <Card variant="flat" style={styles.deviceCard}>
          <View style={styles.deviceHeader}>
            <Smartphone size={14} color={colors.textSecondary} />
            <Text style={styles.deviceTitle}>Auto-attached to this report</Text>
          </View>
          <Text style={styles.deviceLine} numberOfLines={1}>
            {device.brand ? `${device.brand} ` : ''}
            {device.modelName ?? device.deviceName ?? 'Unknown device'}
            {device.os ? ` · ${device.os}` : ''}
            {device.osVersion ? ` ${device.osVersion}` : ''}
          </Text>
          <Text style={styles.deviceLine}>
            App v{device.appVersion ?? '?'}
            {device.channel ? ` · ${device.channel}` : ''}
            {device.updateId ? ` · OTA ${shortId(device.updateId)}` : ''}
          </Text>
        </Card>

        {/* Submit */}
        <Button
          label={submitting ? 'Submitting…' : 'Submit report'}
          icon={<Send size={18} color={colors.textOnAccent} />}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
          fullWidth
          style={styles.submitBtn}
        />

        {/* Recent reports */}
        <Text style={[styles.sectionLabel, styles.recentLabel]}>
          Your recent reports
        </Text>
        {loadingRecent ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<Info size={24} color={colors.textMuted} />}
            title="Nothing yet"
            description="Reports you file will show up here with live status."
            compact
          />
        ) : (
          <View>
            {recent.map((r) => (
              <Card key={r.id} variant="flat" style={styles.recentRow}>
                <View style={styles.recentRowInner}>
                  <View style={styles.recentIconWrap}>
                    <AlertTriangle size={16} color={SEVERITY_TINT[r.severity]} />
                  </View>
                  <View style={styles.recentText}>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>
                      {SEVERITY_LABEL[r.severity]} · {CATEGORY_LABEL[r.category]} ·{' '}
                      {formatTime(r.created_at)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: STATUS_TINT[r.status] + '22' },
                    ]}
                  >
                    <Text
                      style={[styles.statusText, { color: STATUS_TINT[r.status] }]}
                    >
                      {STATUS_LABEL[r.status]}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - d.getTime()) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.amber + '14',
    borderWidth: 1,
    borderColor: colors.amber + '33',
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  bannerIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.amber + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  gap: {
    marginTop: spacing.md,
  },

  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface900,
  },
  chipActive: {
    backgroundColor: colors.emerald + '22',
    borderColor: colors.emerald,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.emerald,
    fontWeight: '700',
  },

  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  detailsToggleText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  deviceCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 6,
  },
  deviceTitle: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  deviceLine: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  submitBtn: {
    marginTop: spacing.xl,
  },

  recentLabel: {
    marginTop: spacing.xxl,
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  recentRow: {
    padding: 0,
    marginBottom: spacing.xs,
  },
  recentRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recentIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.surface900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: {
    flex: 1,
  },
  recentTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  recentMeta: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  statusText: {
    ...typography.micro,
    fontWeight: '700',
  },
});
