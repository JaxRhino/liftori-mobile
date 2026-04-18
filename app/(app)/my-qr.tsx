/**
 * My QR — Wave 13 networking feature (mobile).
 *
 * Every team member gets a personal QR that encodes
 *   https://liftori.ai/meet/<rep_handle>
 *
 * Show it at events, drop it into an Instagram story, stick it on a
 * business card — any prospect who scans it lands on a branded form
 * that's pre-attributed to the rep, so leads and booked calls show up
 * on the rep's own attribution dashboard.
 *
 * Screen layout:
 *   • Large QR card (white background so phone cameras can actually read
 *     it against our dark theme)
 *   • Handle row with Copy + Share actions
 *   • "Claim handle" empty state for users who don't have one yet
 *   • Four compact stat tiles — scans (7d / all), leads (30d / all),
 *     booked (30d), revenue (all-time)
 *   • How-it-works card so first-time users understand the flow
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  BarChart3,
  Calendar,
  Check,
  Copy,
  DollarSign,
  QrCode,
  Scan,
  Share2,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import {
  QrStats,
  RepHandleInfo,
  formatRevenue,
  getMyHandle,
  getMyQrStats,
  setMyHandle,
  validateHandle,
} from '@/lib/qrService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

const DEFAULT_STATS: QrStats = {
  scans_7d: 0,
  scans_all: 0,
  leads_30d: 0,
  leads_all: 0,
  booked_30d: 0,
  revenue_all_cents: 0,
};

export default function MyQrScreen() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [handleInfo, setHandleInfo] = useState<RepHandleInfo>({ handle: null, meetUrl: null });
  const [stats, setStats] = useState<QrStats>(DEFAULT_STATS);

  // Claim-handle form state
  const [claiming, setClaiming] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [handleError, setHandleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Copy button feedback
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [info, s] = await Promise.all([
        getMyHandle(user.id),
        getMyQrStats(user.id),
      ]);
      setHandleInfo(info);
      setStats(s);
    } catch (err) {
      console.warn('my-qr refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCopy = useCallback(async () => {
    if (!handleInfo.meetUrl) return;
    haptics.tap();
    await Clipboard.setStringAsync(handleInfo.meetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [handleInfo.meetUrl]);

  const handleShare = useCallback(async () => {
    if (!handleInfo.meetUrl) return;
    haptics.bump();
    try {
      await Share.share({
        message: `Let's connect — scan this to reach me: ${handleInfo.meetUrl}`,
        url: handleInfo.meetUrl,
      });
    } catch {
      // user cancelled — no-op
    }
  }, [handleInfo.meetUrl]);

  const openClaim = useCallback(() => {
    haptics.tap();
    // Seed input with email local-part as a starting suggestion
    const seed = (profile?.email || user?.email || '').split('@')[0] || '';
    setHandleInput(seed.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
    setHandleError(null);
    setClaiming(true);
  }, [profile?.email, user?.email]);

  const submitClaim = useCallback(async () => {
    if (!user?.id) return;
    const v = validateHandle(handleInput);
    if (!v.ok) {
      setHandleError(v.reason);
      haptics.warn();
      return;
    }
    setSaving(true);
    setHandleError(null);
    try {
      const info = await setMyHandle(user.id, v.handle);
      setHandleInfo(info);
      setClaiming(false);
      haptics.success();
      // Refresh stats once handle is set (will be all zeros, but nice
      // for the UI to settle)
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save handle.';
      setHandleError(msg);
      haptics.error();
    } finally {
      setSaving(false);
    }
  }, [handleInput, refresh, user?.id]);

  const tiles = useMemo(
    () => [
      {
        icon: <Scan size={16} color={colors.sky} />,
        label: 'Scans',
        value: String(stats.scans_7d),
        hint: `${stats.scans_all} all time`,
        tint: colors.sky,
      },
      {
        icon: <UserPlus size={16} color={colors.purple} />,
        label: 'Leads',
        value: String(stats.leads_30d),
        hint: `${stats.leads_all} all time`,
        tint: colors.purple,
      },
      {
        icon: <Calendar size={16} color={colors.emerald} />,
        label: 'Booked',
        value: String(stats.booked_30d),
        hint: 'last 30 days',
        tint: colors.emerald,
      },
      {
        icon: <DollarSign size={16} color={colors.amber} />,
        label: 'Revenue',
        value: formatRevenue(stats.revenue_all_cents),
        hint: 'all time',
        tint: colors.amber,
      },
    ],
    [stats],
  );

  return (
    <SafeScreen bottom="skip" scroll>
      <Header title="My QR" showBack />
      <View style={styles.body}>

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={colors.purple} />
          </View>
        ) : handleInfo.handle ? (
          <>
            {/* QR card — white bg for max scannability */}
            <Card variant="elevated" style={styles.qrCard}>
              <View style={styles.qrInner}>
                <QRCode
                  value={handleInfo.meetUrl || ''}
                  size={220}
                  backgroundColor="#ffffff"
                  color="#060B18"
                />
              </View>
              <Text style={styles.handleLabel}>liftori.ai/meet/</Text>
              <Text style={styles.handleValue}>{handleInfo.handle}</Text>
            </Card>

            {/* Action row */}
            <View style={styles.actionRow}>
              <Button
                label={copied ? 'Copied' : 'Copy link'}
                variant="outline"
                size="md"
                icon={
                  copied ? (
                    <Check size={18} color={colors.emerald} />
                  ) : (
                    <Copy size={18} color={colors.textPrimary} />
                  )
                }
                onPress={handleCopy}
                style={{ flex: 1 }}
              />
              <Button
                label="Share"
                variant="primary"
                size="md"
                icon={<Share2 size={18} color={colors.textOnAccent} />}
                onPress={handleShare}
                style={{ flex: 1 }}
              />
            </View>

            {/* Stat tiles */}
            <Text style={styles.sectionLabel}>Attribution</Text>
            <View style={styles.tilesGrid}>
              {tiles.map((t) => (
                <View key={t.label} style={styles.tile}>
                  <View style={[styles.tileIcon, { backgroundColor: t.tint + '1f' }]}>
                    {t.icon}
                  </View>
                  <Text style={styles.tileValue}>{t.value}</Text>
                  <Text style={styles.tileLabel}>{t.label}</Text>
                  <Text style={styles.tileHint}>{t.hint}</Text>
                </View>
              ))}
            </View>

            {/* How it works */}
            <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>How it works</Text>
            <Card variant="flat" style={styles.howCard}>
              <HowRow
                n={1}
                title="Show the QR"
                body="Hand someone your phone or beam it from your laptop — their camera opens a Liftori-branded capture form."
              />
              <HowRow
                n={2}
                title="They tell us what they need"
                body="Services, notes, and optionally a 15-min discovery call booked on your calendar."
              />
              <HowRow
                n={3}
                title="You get the credit"
                body="Lead lands in the pipeline pre-assigned to you. Revenue tied back to your QR forever."
              />
            </Card>

            {/* Change handle */}
            <Pressable
              style={styles.changeLink}
              onPress={() => {
                setHandleInput(handleInfo.handle || '');
                setHandleError(null);
                setClaiming(true);
              }}
            >
              <Text style={styles.changeLinkText}>Change my handle</Text>
            </Pressable>
          </>
        ) : (
          /* ───────── No-handle empty state ───────── */
          <>
            <Card variant="elevated" style={styles.emptyCard}>
              <View style={[styles.qrIconBlob]}>
                <QrCode size={48} color={colors.purple} />
              </View>
              <Text style={styles.emptyTitle}>Claim your handle</Text>
              <Text style={styles.emptyBody}>
                Pick a short, memorable handle. It's the last bit of your personal Liftori URL — and what attributes every scan, lead, and booked call back to you.
              </Text>
              <Button
                label="Pick a handle"
                variant="primary"
                size="md"
                icon={<Sparkles size={18} color={colors.textOnAccent} />}
                onPress={openClaim}
                fullWidth
              />
            </Card>

            <Card variant="flat" style={styles.howCard}>
              <HowRow
                n={1}
                title="Pick your handle"
                body="Letters, numbers, dashes or underscores. It'll show up at liftori.ai/meet/yourhandle."
              />
              <HowRow
                n={2}
                title="Share your QR"
                body="Displayed right here. Pop it up anywhere — events, DMs, email signatures, stickers."
              />
              <HowRow
                n={3}
                title="Get paid for the lead"
                body="Every scan logs a trail; every booking and deal attributes back to your dashboard."
              />
            </Card>
          </>
        )}

      </View>

      {/* Claim-handle modal (inline, not a real Modal — simpler UX) */}
      {claiming ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your handle</Text>
              <Pressable
                hitSlop={12}
                onPress={() => {
                  haptics.tap();
                  setClaiming(false);
                }}
              >
                <X size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.modalSub}>
              liftori.ai/meet/<Text style={styles.modalSubHighlight}>{handleInput || 'yourhandle'}</Text>
            </Text>

            <View style={styles.modalInputWrap}>
              <TextInput
                value={handleInput}
                onChangeText={(t) => {
                  setHandleError(null);
                  setHandleInput(t.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
                }}
                placeholder="yourhandle"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={24}
                style={styles.modalInput}
                editable={!saving}
              />
            </View>

            {handleError ? <Text style={styles.modalError}>{handleError}</Text> : null}

            <Text style={styles.modalRules}>
              3–24 characters · letters, numbers, - and _ only · must start with a letter.
            </Text>

            <Button
              label={saving ? 'Saving…' : 'Save handle'}
              variant="primary"
              size="md"
              onPress={submitClaim}
              loading={saving}
              fullWidth
            />
          </View>
        </View>
      ) : null}
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function HowRow({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howBadge}>
        <Text style={styles.howBadgeText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.howTitle}>{title}</Text>
        <Text style={styles.howBody}>{body}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  loadingBlock: {
    paddingVertical: spacing.xxxl * 2,
    alignItems: 'center',
  },

  // QR card
  qrCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface800,
  },
  qrInner: {
    backgroundColor: '#ffffff',
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  handleLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  handleValue: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },

  // Stat tiles
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  tile: {
    width: '50%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  tileValue: {
    ...typography.display,
    fontSize: 24,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  tileLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: 2,
  },
  tileHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Wrap tiles in card-like surfaces
  tileInner: {
    backgroundColor: colors.surface900,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // How-it-works
  howCard: {
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  howRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  howBadge: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: colors.purple + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howBadgeText: {
    ...typography.caption,
    color: colors.purple,
    fontWeight: '800',
  },
  howTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  howBody: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  changeLink: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  changeLinkText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  qrIconBlob: {
    width: 80,
    height: 80,
    borderRadius: radii.lg,
    backgroundColor: colors.purple + '1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },

  // Claim modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,11,24,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface800,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  modalSub: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  modalSubHighlight: {
    color: colors.purple,
    fontWeight: '700',
  },
  modalInputWrap: {
    backgroundColor: colors.surface900,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  modalInput: {
    ...typography.h3,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  modalError: {
    ...typography.caption,
    color: colors.rose,
    marginBottom: spacing.sm,
  },
  modalRules: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 16,
  },
});
