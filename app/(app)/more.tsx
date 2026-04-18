/**
 * More tab — identity + live Pulse clock + sign-out + roadmap rows.
 *
 * Wave 5 makes the Pulse row live (tap-to-clock in/out with running timer)
 * and pulls the tier badge from the Pulse all-time view so the avatar ring
 * reflects the user's current rank. The Sign Out flow is real; the "future
 * wave" rows remain placeholders until those features ship.
 */
import React, { useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  Bell,
  Bug,
  Clock,
  HelpCircle,
  LogOut,
  Megaphone,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  User,
  Video,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import { useClock } from '@/lib/useClock';
import {
  PulseTier,
  fetchAllTimeRow,
  formatClock,
  formatHours,
  tierFor,
} from '@/lib/pulseService';
import {
  fetchUnreadCount,
  subscribeToNotifications,
} from '@/lib/notificationsService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Row = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  wave?: string;
  badge?: string;
  onPress?: () => void;
};

export default function MoreScreen() {
  const { profile, user, isAdmin, isFounder, signOut } = useAuth();
  const router = useRouter();
  const clock = useClock();
  const [signingOut, setSigningOut] = useState(false);
  const [tier, setTier] = useState<PulseTier | null>(null);
  const [ttd, setTtd] = useState<number>(0);
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);

  // Pull the user's tier + TTD from v_pulse_all_time
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void (async () => {
      try {
        const row = await fetchAllTimeRow(user.id);
        if (!alive) return;
        const seconds = row?.ttd_seconds ?? 0;
        setTtd(seconds);
        setTier(tierFor(seconds));
      } catch {
        // non-fatal
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, clock.isRunning]);

  // Unread notifications badge — refetch on focus + subscribe for live bumps
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    const refresh = async () => {
      try {
        const n = await fetchUnreadCount(user.id);
        if (alive) setUnreadNotifs(n);
      } catch {
        // non-fatal
      }
    };

    void refresh();

    const appSub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') void refresh();
      },
    );

    const offRT = subscribeToNotifications(user.id, () => {
      if (alive) setUnreadNotifs((prev) => prev + 1);
    });

    return () => {
      alive = false;
      appSub.remove();
      offRT();
    };
  }, [user?.id]);

  const handleSignOut = () => {
    haptics.thud();
    Alert.alert('Sign out?', 'You will need to sign in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
        },
      },
    ]);
  };

  const rows: Row[] = [
    {
      icon: <User size={20} color={colors.emerald} />,
      title: 'My Profile',
      subtitle: 'Avatar, name, title',
      wave: 'Soon',
    },
    {
      icon: <Bell size={20} color={colors.amber} />,
      title: 'Notifications',
      subtitle:
        unreadNotifs > 0
          ? `${unreadNotifs} unread`
          : 'Push, chat, announcements',
      badge: unreadNotifs > 0 ? (unreadNotifs > 99 ? '99+' : String(unreadNotifs)) : undefined,
      onPress: () => {
        haptics.tap();
        router.push('/notifications' as any);
      },
    },
    {
      icon: <Megaphone size={20} color={colors.purple} />,
      title: 'Announcements',
      subtitle: 'Team broadcasts + acks',
      wave: 'Soon',
    },
    {
      icon: <Bug size={20} color={colors.rose} />,
      title: 'Report a Bug',
      subtitle: 'Submit from the field',
      wave: 'Soon',
    },
    {
      icon: <Video size={20} color={colors.indigo} />,
      title: 'Video Calls',
      subtitle: 'EOS + client meetings',
      wave: 'Soon',
    },
    {
      icon: <Settings size={20} color={colors.textSecondary} />,
      title: 'Settings',
      subtitle: 'Appearance, cache',
      wave: 'Soon',
    },
    {
      icon: <HelpCircle size={20} color={colors.textSecondary} />,
      title: 'Help & Support',
      subtitle: 'Contact the Liftori team',
      wave: 'Soon',
    },
  ];

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const buildLabel = `v${appVersion} · Wave 8`;

  return (
    <SafeScreen bottom="skip" scroll>
      <Header title="More" />
      <View style={styles.body}>
        {/* Identity */}
        <Card variant="elevated" style={styles.identity}>
          <View style={styles.identityRow}>
            <Avatar
              name={profile?.full_name ?? profile?.email ?? 'Liftori'}
              url={profile?.avatar_url ?? undefined}
              size="lg"
              ring={tier?.color ?? colors.emerald}
            />
            <View style={styles.identityText}>
              <Text style={styles.identityName}>
                {profile?.full_name ?? user?.email ?? 'Liftori member'}
              </Text>
              <Text style={styles.identityEmail}>{user?.email}</Text>
              <View style={styles.badgeRow}>
                {isFounder ? (
                  <Badge
                    icon={<Sparkles size={12} color={colors.textOnAccent} />}
                    label="Founder"
                    color={colors.emerald}
                  />
                ) : null}
                {isAdmin ? (
                  <Badge
                    icon={<ShieldCheck size={12} color={colors.textOnAccent} />}
                    label="Admin"
                    color={colors.purple}
                  />
                ) : null}
                {profile?.role && !isFounder && !isAdmin ? (
                  <Badge label={cap(profile.role)} color={colors.sky} />
                ) : null}
                {tier ? <Badge label={tier.label} color={tier.color} /> : null}
              </View>
            </View>
          </View>
        </Card>

        {/* Live Pulse row */}
        <Text style={styles.sectionLabel}>Pulse</Text>
        <Card
          variant="flat"
          onPress={() => {
            if (clock.isRunning) void clock.clockOut();
            else void clock.clockIn();
          }}
          style={styles.pulseCard}
        >
          <View style={styles.pulseInner}>
            <View
              style={[
                styles.pulseIcon,
                {
                  backgroundColor:
                    (clock.isRunning ? colors.amber : colors.emerald) + '1f',
                },
              ]}
            >
              {clock.isRunning ? (
                <Square size={20} color={colors.amber} fill={colors.amber} />
              ) : (
                <Play size={20} color={colors.emerald} fill={colors.emerald} />
              )}
            </View>
            <View style={styles.pulseText}>
              <Text style={styles.pulseTitle}>
                {clock.isRunning ? 'Clocked in' : 'Clocked out'}
              </Text>
              <Text style={styles.pulseSub}>
                {clock.isRunning
                  ? `On the clock for ${formatClock(clock.elapsed)}`
                  : 'Tap to clock in'}
              </Text>
            </View>
            {ttd > 0 ? (
              <View style={styles.ttdPill}>
                <Clock size={12} color={colors.textSecondary} />
                <Text style={styles.ttdText}>{formatHours(ttd)}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Future sections */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Sections</Text>
        <View>
          {rows.map((row) => (
            <Card
              key={row.title}
              variant="flat"
              onPress={row.onPress}
              style={styles.row}
            >
              <View style={styles.rowInner}>
                <View style={styles.rowIcon}>{row.icon}</View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                </View>
                {row.badge ? (
                  <View style={styles.badgePill}>
                    <Text style={styles.badgePillText}>{row.badge}</Text>
                  </View>
                ) : row.wave ? (
                  <Text style={styles.wavePill}>{row.wave}</Text>
                ) : null}
              </View>
            </Card>
          ))}
        </View>

        <Button
          label={signingOut ? 'Signing out…' : 'Sign out'}
          variant="outline"
          size="md"
          icon={<LogOut size={18} color={colors.textPrimary} />}
          onPress={handleSignOut}
          loading={signingOut}
          fullWidth
          style={{ marginTop: spacing.xl }}
        />

        <Text style={styles.versionText}>Liftori Mobile · {buildLabel}</Text>
      </View>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function Badge({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      {icon}
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function cap(s: string) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  identity: {
    padding: 0,
    marginBottom: spacing.xl,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  identityEmail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  badgeText: {
    ...typography.micro,
    color: colors.textOnAccent,
    fontWeight: '700',
  },

  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },

  // Pulse row
  pulseCard: {
    padding: 0,
  },
  pulseInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pulseIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseText: {
    flex: 1,
  },
  pulseTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  pulseSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  ttdPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface900,
  },
  ttdText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Menu rows
  row: {
    padding: 0,
    marginBottom: spacing.xs,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  wavePill: {
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
  badgePill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillText: {
    ...typography.micro,
    color: colors.textOnAccent,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  versionText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
  },
});
