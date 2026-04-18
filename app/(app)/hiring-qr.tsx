/**
 * My Hiring QR — Wave 15 (mobile).
 *
 * Third QR surface for every team member. Encodes
 *   https://liftori.ai/apply/<rep_handle>
 *
 * Shown on job boards, flyers, referral cards, "we're hiring" posts,
 * conference tables, sidewalk signs. Lands applicants on a public
 * careers page with the application form pre-attributed to the rep
 * who shared the QR. Hires made through this link qualify for the
 * 5% / 90-day referral bonus via hiring_referrals.
 *
 * The rep_handle is SHARED with /meet and /invest — one handle powers
 * three QR surfaces. If the user hasn't claimed a handle yet, this
 * screen routes them to /my-qr to do that first.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import {
  BriefcaseBusiness,
  Check,
  Copy,
  GraduationCap,
  QrCode,
  Share2,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import { RepHandleInfo, getMyHandle } from '@/lib/qrService';
import {
  HiringQrStats,
  applyUrlForHandle,
  getMyHiringQrStats,
} from '@/lib/hiringQrService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

const DEFAULT_STATS: HiringQrStats = {
  referrals_7d: 0,
  referrals_all: 0,
  interviews_all: 0,
  hired_all: 0,
};

export default function HiringQrScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [handleInfo, setHandleInfo] = useState<RepHandleInfo>({ handle: null, meetUrl: null });
  const [stats, setStats] = useState<HiringQrStats>(DEFAULT_STATS);
  const [copied, setCopied] = useState(false);

  const applyUrl = useMemo(
    () => applyUrlForHandle(handleInfo.handle),
    [handleInfo.handle],
  );

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [info, s] = await Promise.all([
        getMyHandle(user.id),
        getMyHiringQrStats(user.id),
      ]);
      setHandleInfo(info);
      setStats(s);
    } catch (err) {
      console.warn('hiring-qr refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCopy = useCallback(async () => {
    if (!applyUrl) return;
    haptics.tap();
    await Clipboard.setStringAsync(applyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [applyUrl]);

  const handleShare = useCallback(async () => {
    if (!applyUrl) return;
    haptics.bump();
    try {
      await Share.share({
        message: `Liftori is hiring — apply through my link and we'll make sure you land in front of the right person: ${applyUrl}`,
        url: applyUrl,
      });
    } catch {
      // user cancelled — no-op
    }
  }, [applyUrl]);

  const goClaimHandle = useCallback(() => {
    haptics.tap();
    router.push('/my-qr' as any);
  }, [router]);

  const tiles = useMemo(
    () => [
      {
        icon: <UserPlus size={16} color={colors.emerald} />,
        label: 'Referrals',
        value: String(stats.referrals_7d),
        hint: `${stats.referrals_all} all time`,
        tint: colors.emerald,
      },
      {
        icon: <Users size={16} color={colors.sky} />,
        label: 'Applicants',
        value: String(stats.referrals_all),
        hint: 'all time',
        tint: colors.sky,
      },
      {
        icon: <GraduationCap size={16} color={colors.amber} />,
        label: 'Interviews',
        value: String(stats.interviews_all),
        hint: 'all time',
        tint: colors.amber,
      },
      {
        icon: <UserCheck size={16} color={colors.purple} />,
        label: 'Hired',
        value: String(stats.hired_all),
        hint: '5% / 90-day bonus',
        tint: colors.purple,
      },
    ],
    [stats],
  );

  return (
    <SafeScreen bottom="skip" scroll>
      <Header title="Hiring QR" showBack />
      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={colors.emerald} />
          </View>
        ) : handleInfo.handle && applyUrl ? (
          <>
            {/* Careers ribbon */}
            <View style={styles.ribbon}>
              <BriefcaseBusiness size={14} color={colors.emerald} />
              <Text style={styles.ribbonText}>Careers · We're Hiring</Text>
            </View>

            {/* QR card — white bg for scannability */}
            <Card variant="elevated" style={styles.qrCard}>
              <View style={styles.qrInner}>
                <QRCode
                  value={applyUrl}
                  size={220}
                  backgroundColor="#ffffff"
                  color="#060B18"
                />
              </View>
              <Text style={styles.handleLabel}>liftori.ai/apply/</Text>
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
            <Text style={styles.sectionLabel}>Referral Attribution</Text>
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
                title="Post your QR anywhere"
                body="Job boards, flyers, social posts, events, sidewalk signs. Anywhere you'd say 'we're hiring.'"
              />
              <HowRow
                n={2}
                title="Applicants land pre-attributed"
                body="The /apply page shows your name + photo, collects resume + role + salary, and sends them straight into HR Hub tagged as your referral."
              />
              <HowRow
                n={3}
                title="Get paid when they're hired"
                body="If your referral gets hired, you earn 5% of their first 90 days of salary, paid automatically from their first two paychecks."
              />
            </Card>

            <Pressable style={styles.changeLink} onPress={goClaimHandle}>
              <Text style={styles.changeLinkText}>
                Handle shared with your networking QR · Manage in My QR
              </Text>
            </Pressable>
          </>
        ) : (
          /* ───────── No-handle state ───────── */
          <>
            <Card variant="elevated" style={styles.emptyCard}>
              <View style={styles.qrIconBlob}>
                <QrCode size={48} color={colors.emerald} />
              </View>
              <Text style={styles.emptyTitle}>Claim your handle first</Text>
              <Text style={styles.emptyBody}>
                Your Hiring QR uses the same handle as your networking QR. Pick one over in My QR and come back here — we'll generate the careers link instantly.
              </Text>
              <Button
                label="Claim a handle"
                variant="primary"
                size="md"
                icon={<Sparkles size={18} color={colors.textOnAccent} />}
                onPress={goClaimHandle}
                fullWidth
              />
            </Card>
          </>
        )}
      </View>
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

  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.emerald + '66',
    backgroundColor: colors.emerald + '1a',
    marginBottom: spacing.md,
  },
  ribbonText: {
    ...typography.micro,
    color: colors.emerald,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

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
    backgroundColor: colors.emerald + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howBadgeText: {
    ...typography.caption,
    color: colors.emerald,
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
    textAlign: 'center',
  },

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
    backgroundColor: colors.emerald + '1a',
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
});
