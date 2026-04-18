/**
 * Home tab — "mission control" for today.
 *
 * What's on screen:
 *   • Greeting header + user avatar
 *   • Pulse clock chip (tap to clock in / tap to clock out, live HH:MM:SS)
 *   • Pipeline glance (open leads, weighted $, won this month)
 *   • Today's actions (leads where next_action_date = today AND assigned to me)
 *   • Quick-action rail (+ New Lead, + Book Appointment)
 *
 * Data is fetched on mount and on pull-to-refresh. Clock ticks locally every
 * second via the useClock hook.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpRight,
  ClipboardList,
  Play,
  Square,
  TrendingUp,
  Target,
  Trophy,
  CalendarCheck,
  PhoneCall,
  Plus,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import { useClock } from '@/lib/useClock';
import { formatClock } from '@/lib/pulseService';
import {
  Lead,
  formatMoney,
  isClosedStage,
  listLeads,
  stageMetaFor,
  summarize,
} from '@/lib/leadsService';
import { colors, radii, shadows, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const clock = useClock();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      const data = await listLeads({ includeClosed: false });
      setLeads(data);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[home] listLeads failed:', e);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchLeads();
      setLoading(false);
    })();
  }, [fetchLeads]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchLeads(), clock.refresh()]);
    setRefreshing(false);
  }, [fetchLeads, clock]);

  const firstName =
    profile?.full_name?.split(' ')[0] ?? profile?.email?.split('@')[0] ?? 'there';

  const summary = summarize(leads);
  const wonThisMonth = countWonThisMonth(leads);

  const todayStr = todayISODate();
  const myTodayLeads = leads
    .filter((l) => !isClosedStage(l.stage))
    .filter((l) => l.next_action_date === todayStr)
    .filter((l) => !l.assigned_to || l.assigned_to === user?.id);

  return (
    <SafeScreen bottom="skip" scroll onRefresh={onRefresh} refreshing={refreshing}>
      <Header
        title={greeting() + ','}
        subtitle={`${firstName} — let's lift something today.`}
        trailing={<Avatar name={profile?.full_name ?? profile?.email ?? 'L'} size="sm" />}
      />

      <View style={styles.body}>
        {/* Clock chip */}
        <ClockChip
          running={clock.isRunning}
          elapsed={clock.elapsed}
          loading={clock.loading}
          onPress={() => {
            if (clock.isRunning) void clock.clockOut();
            else void clock.clockIn();
          }}
        />

        {/* Pipeline glance */}
        <Text style={styles.sectionLabel}>Pipeline</Text>
        <View style={styles.statRow}>
          <StatTile
            icon={<Target size={18} color={colors.sky} />}
            label="Open leads"
            value={String(summary.openCount)}
          />
          <StatTile
            icon={<TrendingUp size={18} color={colors.emerald} />}
            label="Weighted"
            value={formatMoney(summary.openWeightedCents)}
          />
          <StatTile
            icon={<Trophy size={18} color={colors.amber} />}
            label="Won this month"
            value={String(wonThisMonth)}
          />
        </View>

        {/* Today's actions */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Today's actions</Text>
          {myTodayLeads.length > 0 ? (
            <Pressable
              onPress={() => {
                haptics.tap();
                router.push('/work');
              }}
              hitSlop={10}
            >
              <Text style={styles.sectionLink}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <Card variant="flat" style={styles.emptyCard}>
            <Text style={styles.muted}>Loading…</Text>
          </Card>
        ) : myTodayLeads.length === 0 ? (
          <Card variant="outline" style={styles.emptyCard}>
            <EmptyState
              compact
              icon={<CalendarCheck size={24} color={colors.textMuted} />}
              title="You're clear for today"
              description="Nothing on your calendar. Good time to prospect or capture a new lead."
            />
          </Card>
        ) : (
          <View style={styles.leadList}>
            {myTodayLeads.slice(0, 5).map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                onPress={() => {
                  haptics.tap();
                  router.push(`/work?lead=${lead.id}` as any);
                }}
              />
            ))}
          </View>
        )}

        {/* Quick actions */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Quick capture</Text>
        <View style={styles.quickRow}>
          <QuickAction
            accent={colors.emerald}
            icon={<ClipboardList size={22} color={colors.emerald} />}
            title="New Lead"
            onPress={() => {
              haptics.bump();
              router.push('/create/lead');
            }}
          />
          <QuickAction
            accent={colors.amber}
            icon={<PhoneCall size={22} color={colors.amber} />}
            title="Book Call"
            onPress={() => {
              haptics.bump();
              router.push('/create/appointment');
            }}
          />
        </View>
      </View>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function ClockChip({
  running,
  elapsed,
  loading,
  onPress,
}: {
  running: boolean;
  elapsed: number;
  loading: boolean;
  onPress: () => void;
}) {
  const accent = running ? colors.amber : colors.emerald;
  const label = running ? formatClock(elapsed) : 'Clock In';
  const Icon = running ? Square : Play;
  const sublabel = running ? 'On the clock' : loading ? 'Loading…' : 'Tap to start your day';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.clockChip,
        { borderColor: accent + '40', backgroundColor: accent + '14' },
        pressed && styles.clockChipPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={running ? 'Clock out' : 'Clock in'}
    >
      <View style={[styles.clockIcon, { backgroundColor: accent + '26' }]}>
        <Icon size={18} color={accent} fill={running ? accent : 'transparent'} />
      </View>
      <View style={styles.clockText}>
        <Text style={[styles.clockLabel, { color: accent }]}>{label}</Text>
        <Text style={styles.clockSublabel}>{sublabel}</Text>
      </View>
      <ArrowUpRight size={18} color={accent} />
    </Pressable>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function LeadRow({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const meta = stageMetaFor(lead.product_type, lead.stage);
  const money =
    (lead.deal_value_cents || 0) > 0
      ? formatMoney(lead.deal_value_cents)
      : (lead.mrr_cents || 0) > 0
        ? `${formatMoney(lead.mrr_cents)}/mo`
        : null;
  return (
    <Card variant="flat" onPress={onPress} accent={stageAccent(meta.color)} style={styles.leadCard}>
      <View style={styles.leadRow}>
        <View style={styles.leadMain}>
          <Text style={styles.leadTitle} numberOfLines={1}>
            {lead.title}
          </Text>
          <Text style={styles.leadSub} numberOfLines={1}>
            {lead.company_name || lead.contact_name || '—'} · {meta.label}
          </Text>
        </View>
        {money ? <Text style={styles.leadMoney}>{money}</Text> : null}
      </View>
      {lead.next_action ? (
        <Text style={styles.leadAction} numberOfLines={2}>
          {lead.next_action}
        </Text>
      ) : null}
    </Card>
  );
}

function QuickAction({
  accent,
  icon,
  title,
  onPress,
}: {
  accent: string;
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTile,
        { borderColor: accent + '40' },
        pressed && styles.quickTilePressed,
      ]}
    >
      <View style={[styles.quickIcon, { backgroundColor: accent + '1f' }]}>{icon}</View>
      <Text style={styles.quickTitle}>{title}</Text>
      <View style={[styles.quickPlus, { backgroundColor: accent }]}>
        <Plus size={14} color={colors.textOnAccent} strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Late night';
}

function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function countWonThisMonth(leads: Lead[]): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return leads.filter((l) => {
    if (l.stage !== 'won') return false;
    const changed = new Date(l.stage_changed_at || l.updated_at);
    return changed.getFullYear() === year && changed.getMonth() === month;
  }).length;
}

function stageAccent(color: string): string {
  switch (color) {
    case 'emerald': return colors.emerald;
    case 'rose':    return colors.rose;
    case 'amber':   return colors.amber;
    case 'sky':
    case 'blue':    return colors.sky;
    case 'indigo':  return colors.indigo;
    case 'violet':
    case 'purple':  return colors.purple;
    default:        return colors.surface600;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.md,
  },
  sectionLink: {
    ...typography.caption,
    color: colors.emerald,
    marginBottom: spacing.xs,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Clock chip
  clockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    ...shadows.card,
  },
  clockChipPressed: {
    opacity: 0.85,
  },
  clockIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockText: {
    flex: 1,
  },
  clockLabel: {
    ...typography.h2,
    fontVariant: ['tabular-nums'],
  },
  clockSublabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Pipeline glance
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface800,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  statIcon: {
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Leads
  emptyCard: {
    paddingVertical: spacing.md,
  },
  leadList: {
    gap: spacing.sm,
  },
  leadCard: {
    padding: 0,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  leadMain: {
    flex: 1,
  },
  leadTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  leadSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  leadMoney: {
    ...typography.bodyMedium,
    color: colors.emerald,
  },
  leadAction: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // Quick actions
  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface800,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  quickTilePressed: {
    opacity: 0.85,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  quickPlus: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
