/**
 * Home tab — the daily "mission control" feed.
 *
 * Wave 0 stub: greets the signed-in user and points at upcoming Waves.
 * Wave 2+ will fill this with: announcements, Pulse status, pending acks,
 * recent chat activity, and a quick-action rail.
 */
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, Bell, ClipboardList, MessageCircle, Sparkles } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing, typography } from '@/lib/theme';

export default function HomeScreen() {
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Wave 2+ will refetch announcements, pulse, etc.
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  }, []);

  const firstName =
    profile?.full_name?.split(' ')[0] ?? profile?.email?.split('@')[0] ?? 'there';

  return (
    <SafeScreen bottom="skip">
      <Header
        title={greeting() + ','}
        subtitle={`${firstName} — let's lift something today.`}
        trailing={<Avatar name={profile?.full_name ?? profile?.email ?? 'Liftori'} size="sm" />}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        <Text style={styles.sectionLabel}>Quick Looks</Text>
        <View style={styles.tileRow}>
          <Tile
            icon={<Bell size={20} color={colors.amber} />}
            title="Announcements"
            subtitle="All caught up"
          />
          <Tile
            icon={<MessageCircle size={20} color={colors.sky} />}
            title="Chat"
            subtitle="0 unread"
          />
        </View>
        <View style={styles.tileRow}>
          <Tile
            icon={<ClipboardList size={20} color={colors.emerald} />}
            title="Your Work"
            subtitle="Nothing assigned"
          />
          <Tile
            icon={<Sparkles size={20} color={colors.purple} />}
            title="Pulse"
            subtitle="Clocked out"
          />
        </View>

        <Text style={[styles.sectionLabel, { marginTop: spacing.xxl }]}>What's coming</Text>
        <Card variant="elevated" style={styles.roadmapCard}>
          <View style={styles.roadmapHeader}>
            <Text style={styles.roadmapTitle}>Mobile roadmap</Text>
            <ArrowUpRight size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.roadmapBody}>
            You're in Wave 0 — the shell is live. Next up:{' '}
            <Text style={styles.bold}>the Flagship Wizard</Text> for quick-add records, then{' '}
            Chat + Pulse + Announcements + the full Hub suite.
          </Text>
        </Card>
      </ScrollView>
    </SafeScreen>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Late night';
}

function Tile({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card variant="flat" style={styles.tile}>
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSubtitle}>{subtitle}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    padding: 0,
  },
  tileIcon: {
    marginBottom: spacing.sm,
  },
  tileTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  tileSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roadmapCard: {
    padding: 0,
  },
  roadmapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  roadmapTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  roadmapBody: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bold: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
