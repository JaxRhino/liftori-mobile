/**
 * My Investor QR — Wave 14 (mobile).
 *
 * Every team member gets a second QR that encodes
 *   https://liftori.ai/invest/<rep_handle>
 *
 * Shown in investor conversations (dinners, events, on a business card
 * for a warm intro). It lands prospects on a confidential investor
 * landing page with the pitch + a founder-call booker. The rep who
 * opened the conversation gets attributed on every submission.
 *
 * The rep_handle is SHARED with the "My QR" (/meet) flow — one handle
 * powers both surfaces. If the user hasn't claimed a handle yet, this
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
  Calendar,
  Check,
  Copy,
  DollarSign,
  QrCode,
  Scan,
  Share2,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import { RepHandleInfo, getMyHandle } from '@/lib/qrService';
import {
  InvestorQrStats,
  formatCommitted,
  getMyInvestorQrStats,
  investUrlForHandle,
} from '@/lib/investorQrService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

const DEFAULT_STATS: InvestorQrStats = {
  scans_7d: 0,
  scans_all: 0,
  leads_30d: 0,
  leads_all: 0,
  booked_30d: 0,
  committed_cents_all: 0,
};

export default function InvestorQrScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [handleInfo, setHandleInfo] = useState<RepHandleInfo>({ handle: null, meetUrl: null });
  const [stats, setStats] = useState<InvestorQrStats>(DEFAULT_STATS);
  const [copied, setCopied] = useState(false);

  const investUrl = useMemo(
    () => investUrlForHandle(handleInfo.handle),
    [handleInfo.handle],
  );

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [info, s] = await Promise.all([
        getMyHandle(user.id),
        getMyInvestorQrStats(user.id),
      ]);
      setHandleInfo(info);
      setStats(s);
    } catch (err) {
      console.warn('investor-qr refresh failed', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCopy = useCallback(async () => {
    if (!investUrl) return;
    haptics.tap();
    await Clipboard.setStringAsync(investUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [investUrl]);

  const handleShare = useCallback(async () => {
    if (!investUrl) return;
    haptics.bump();
    try {
      await Share.share({
        message: `Here's a quick look at what we're building at Liftori — ${investUrl}`,
        url: investUrl,
      });
    } catch {
      // user cancelled — no-op
    }
  }, [investUrl]);

  const goClaimHandle = useCallback(() => {
    haptics.tap();
    router.push('/my-qr' as any);
  }, [router]);

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
        label: 'Investors',
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
        label: 'Committed',
        value: formatCommitted(stats.committed_cents_all),
        hint: 'all time',
        tint: colors.amber,
      },
    ],
    [stats],
  );

  return (
    <SafeScreen bottom="skip" scroll>
      <Header title="Investor QR" showBack />
      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={colors.purple} />
          </View>
        ) : handleInfo.handle && investUrl ? (
          <>
            {/* Confidential ribbon */}
            <View style={styles.ribbon}>
              <TrendingUp size={14} color={colors.amber} />
              <Text style={styles.ribbonText}>Investor Room · Confidential</Text>
            </View>

            {/* QR card — white bg for scannability */}
            <Card variant="elevated" style={styles.qrCard}>
              <View style={styles.qrInner}>
                <QRCode
                  value={investUrl}
                  size={220}
                  backgroundColor="#ffffff"
                  color="#060B18"
                />
              </View>
              <Text style={styles.handleLabel}>liftori.ai/invest/</Text>
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
            <Text style={styles.sectionLabel}>Investor Attribution</Text>
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
                title="Someone asks about investing"
                body="Events, flights, dinners, warm intros — whenever the conversation turns to fundraising, show this QR."
              />
              <HowRow
                n={2}
                title="They land on the pitch"
                body="Private, investor-only landing page: the ask, the market, the team, and a clean path to book a founder call."
              />
              <HowRow
                n={3}
                title="Founders take the meeting"
                body="Discovery calls route straight to Ryan or Mike. The introduction is tied back to your QR forever — if the check closes, you're on the cap table conversation."
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
                <QrCode size={48} color={colors.purple} />
              </View>
              <Text style={styles.emptyTitle}>Claim your handle first</Text>
              <Text style={styles.emptyBody}>
                Your Investor QR uses the same handle as your networking QR. Pick one over in My QR and come back here — we'll generate the investor link instantly.
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
    borderColor: colors.amber + '66',
    backgroundColor: colors.amber + '1a',
    marginBottom: spacing.md,
  },
  ribbonText: {
    ...typography.micro,
    color: colors.amber,
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
});
