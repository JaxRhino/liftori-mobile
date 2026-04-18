/**
 * More tab — overflow menu for profile, settings, hub shortcuts, and sign-out.
 *
 * Wave 0 gives us the real Sign Out wiring plus an identity card up top so
 * testers can confirm who they're signed in as. The rest of the list lights up
 * over Waves 2–9 as each hub comes online.
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bell,
  Bug,
  Clock,
  HelpCircle,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  Video,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Row = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  wave?: string;
};

export default function MoreScreen() {
  const { profile, user, isAdmin, isFounder, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const rows: Row[] = [
    {
      icon: <User size={20} color={colors.emerald} />,
      title: 'My Profile',
      subtitle: 'Avatar, name, title',
      wave: 'Wave 2',
    },
    {
      icon: <Bell size={20} color={colors.amber} />,
      title: 'Notifications',
      subtitle: 'Push, chat, announcements',
      wave: 'Wave 2',
    },
    {
      icon: <Clock size={20} color={colors.sky} />,
      title: 'Pulse',
      subtitle: 'Clock in, leaderboard',
      wave: 'Wave 3',
    },
    {
      icon: <Megaphone size={20} color={colors.purple} />,
      title: 'Announcements',
      subtitle: 'Team broadcasts',
      wave: 'Wave 4',
    },
    {
      icon: <Bug size={20} color={colors.rose} />,
      title: 'Report a Bug',
      subtitle: 'Submit from the field',
      wave: 'Wave 4',
    },
    {
      icon: <Video size={20} color={colors.indigo} />,
      title: 'Video Calls',
      subtitle: 'EOS + client meetings',
      wave: 'Wave 8',
    },
    {
      icon: <Settings size={20} color={colors.textSecondary} />,
      title: 'Settings',
      subtitle: 'Appearance, cache',
      wave: 'Wave 9',
    },
    {
      icon: <HelpCircle size={20} color={colors.textSecondary} />,
      title: 'Help & Support',
      subtitle: 'Contact the Liftori team',
      wave: 'Wave 9',
    },
  ];

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

  return (
    <SafeScreen bottom="skip" scroll>
      <Header title="More" />
      <View style={styles.body}>
        <Card variant="elevated" style={styles.identity}>
          <View style={styles.identityRow}>
            <Avatar
              name={profile?.full_name ?? profile?.email ?? 'Liftori'}
              url={profile?.avatar_url ?? undefined}
              size="lg"
              ring={colors.emerald}
            />
            <View style={styles.identityText}>
              <Text style={styles.identityName}>
                {profile?.full_name ?? user?.email ?? 'Liftori member'}
              </Text>
              <Text style={styles.identityEmail}>{user?.email}</Text>
              <View style={styles.badgeRow}>
                {isFounder ? (
                  <Badge icon={<Sparkles size={12} color={colors.textOnAccent} />} label="Founder" color={colors.emerald} />
                ) : null}
                {isAdmin ? (
                  <Badge icon={<ShieldCheck size={12} color={colors.textOnAccent} />} label="Admin" color={colors.purple} />
                ) : null}
                {profile?.role && !isFounder && !isAdmin ? (
                  <Badge label={cap(profile.role)} color={colors.sky} />
                ) : null}
              </View>
            </View>
          </View>
        </Card>

        <Text style={styles.sectionLabel}>Sections</Text>
        <View>
          {rows.map((row, i) => (
            <Card key={row.title} variant="flat" style={[styles.row, i === 0 && styles.firstRow]}>
              <View style={styles.rowInner}>
                <View style={styles.rowIcon}>{row.icon}</View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                </View>
                {row.wave ? <Text style={styles.wavePill}>{row.wave}</Text> : null}
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

        <Text style={styles.versionText}>Liftori Mobile · v0.1.0 · Wave 0</Text>
      </View>
    </SafeScreen>
  );
}

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
  row: {
    padding: 0,
    marginBottom: spacing.xs,
  },
  firstRow: {},
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
  versionText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
  },
});
