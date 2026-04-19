/**
 * Home tab — "mission control" for today.
 *
 * What's on screen:
 *   • LIFTORI wordmark + greeting + avatar (flush-left header)
 *   • Pipeline glance (open leads, weighted $, won this month)
 *   • Today's actions (leads where next_action_date = today AND assigned to me)
 *   • Quick-action rail (+ New Lead, + Book Appointment)
 *
 * The Pulse clock used to live here too — it moved to the More tab per
 * Ryan's request (keeps the home surface focused on pipeline).
 *
 * Data is fetched on mount and on pull-to-refresh.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ClipboardList,
  TrendingUp,
  Target,
  Trophy,
  CalendarCheck,
  PhoneCall,
  Plus,
  Mountain,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import {
  Lead,
  formatMoney,
  isClosedStage,
  listLeads,
  stageMetaFor,
  summarize,
} from '@/lib/leadsService';
import {
  EosDashboard,
  EosRock,
  formatDueLabel,
  getEosDashboard,
  rockProgressColor,
} from '@/lib/eosService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [eos, setEos] = useState<EosDashboard | null>(null);
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

  const fetchEos = useCallback(async () => {
    try {
      // We show all company rocks + issues, but only my own todos —
      // matches the EOS "personal accountability" framing.
      const data = await getEosDashboard({
        rocksOwnerId: null,
        todosOwnerId: user?.id,
        rocksLimit: 10,
        todosLimit: 10,
      });
      setEos(data);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[home] getEosDashboard failed:', e);
    }
  }, [user?.id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([fetchLeads(), fetchEos()]);
      setLoading(false);
    })();
  }, [fetchLeads, fetchEos]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchLeads(), fetchEos()]);
    setRefreshing(false);
  }, [fetchLeads, fetchEos]);

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
      {/* Branded home header — LIFTORI wordmark + greeting, flush-left. */}
      <View style={styles.homeHeader}>
        <View style={styles.headerTopRow}>
          <Text style={styles.wordmark}>LIFTORI</Text>
          <Pressable
            onPress={() => {
              haptics.tap();
              router.push('/profile' as any);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Avatar
              name={profile?.full_name ?? profile?.email ?? 'L'}
              url={profile?.avatar_url ?? undefined}
              size="sm"
            />
          </Pressable>
        </View>
        <Text style={styles.greetingTitle}>{greeting()},</Text>
        <Text style={styles.greetingSub}>
          {firstName} — let&rsquo;s lift something today.
        </Text>
      </View>

      <View style={styles.body}>
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

        {/* EOS section — Rocks, Issues, Todos for the current quarter */}
        <EosSection eos={eos} loading={loading} />

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
// EOS section (home widget)
// ═══════════════════════════════════════════════════════════════════════

function EosSection({
  eos,
  loading,
}: {
  eos: EosDashboard | null;
  loading: boolean;
}) {
  if (loading && !eos) {
    return (
      <>
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>EOS</Text>
        <Card variant="flat" style={styles.emptyCard}>
          <Text style={styles.muted}>Loading…</Text>
        </Card>
      </>
    );
  }

  if (!eos) return null;

  const { stats, quarterLabel, rocks, todos } = eos;
  const hasAnything =
    stats.rocksTotal > 0 || stats.issuesOpen > 0 || todos.length > 0;

  // Show the three rocks most in need of attention — sort by progress asc
  // with at_risk/off_track bubbled up, and drop any that are complete.
  const focusRocks = [...rocks]
    .filter((r) => !r.is_complete && r.status !== 'complete')
    .sort((a, b) => {
      const aRisk = a.status === 'at_risk' || a.status === 'off_track' ? 0 : 1;
      const bRisk = b.status === 'at_risk' || b.status === 'off_track' ? 0 : 1;
      if (aRisk !== bRisk) return aRisk - bRisk;
      return (a.progress_percentage ?? 0) - (b.progress_percentage ?? 0);
    })
    .slice(0, 3);

  const nextTodo = todos.find((t) => t.status !== 'complete');

  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>EOS · {quarterLabel}</Text>
      </View>

      {/* Three-stat summary */}
      <View style={styles.statRow}>
        <EosStatTile
          icon={<Mountain size={18} color={colors.emerald} />}
          value={`${stats.rocksOnTrack + stats.rocksComplete}/${stats.rocksTotal || 0}`}
          label="Rocks on track"
          tone={
            stats.rocksTotal === 0
              ? 'muted'
              : stats.rocksAtRisk > 0
                ? 'warning'
                : 'good'
          }
        />
        <EosStatTile
          icon={<AlertTriangle size={18} color={colors.rose} />}
          value={String(stats.issuesOpen)}
          label="Open issues"
          tone={stats.issuesOpen > 0 ? 'warning' : 'good'}
        />
        <EosStatTile
          icon={<CheckCircle2 size={18} color={colors.sky} />}
          value={String(todos.length)}
          label={
            stats.todosOverdue > 0
              ? `${stats.todosOverdue} overdue`
              : stats.todosDueSoon > 0
                ? `${stats.todosDueSoon} due ≤7d`
                : 'My todos'
          }
          tone={stats.todosOverdue > 0 ? 'bad' : 'muted'}
        />
      </View>

      {/* Focus rocks (top 3 in need of attention) */}
      {focusRocks.length > 0 ? (
        <View style={styles.rockList}>
          {focusRocks.map((r) => (
            <RockRow key={r.id} rock={r} />
          ))}
        </View>
      ) : !hasAnything ? (
        <Card variant="outline" style={styles.emptyCard}>
          <EmptyState
            compact
            icon={<Mountain size={24} color={colors.textMuted} />}
            title="No rocks this quarter"
            description="Set quarterly rocks in the web admin to track progress here."
          />
        </Card>
      ) : null}

      {/* Next-up todo reminder — just one, to keep the section tight */}
      {nextTodo && (
        <NextTodoCard todo={nextTodo} />
      )}
    </>
  );
}

function EosStatTile({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: 'good' | 'warning' | 'bad' | 'muted';
}) {
  const borderColor =
    tone === 'bad'
      ? colors.rose
      : tone === 'warning'
        ? colors.amber
        : tone === 'good'
          ? colors.emerald
          : 'transparent';
  return (
    <View
      style={[
        styles.statTile,
        tone !== 'muted' && {
          borderWidth: 1,
          borderColor: borderColor + '55',
        },
      ]}
    >
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

function RockRow({ rock }: { rock: EosRock }) {
  const pct = Math.max(0, Math.min(100, rock.progress_percentage ?? 0));
  const barColor = rockProgressColor(rock, {
    emerald: colors.emerald,
    amber: colors.amber,
    rose: colors.rose,
    sky: colors.sky,
  });
  const statusLabel =
    rock.status === 'at_risk'
      ? 'At risk'
      : rock.status === 'off_track'
        ? 'Off track'
        : rock.status === 'on_track'
          ? 'On track'
          : rock.status === 'complete' || rock.is_complete
            ? 'Complete'
            : null;
  return (
    <Card variant="flat" style={styles.rockCard}>
      <View style={styles.rockHeader}>
        <Mountain
          size={14}
          color={barColor}
          strokeWidth={2}
          style={{ marginRight: spacing.xs }}
        />
        <Text style={styles.rockTitle} numberOfLines={1}>
          {rock.title}
        </Text>
        <Text style={styles.rockPct}>{pct}%</Text>
      </View>
      <View style={styles.rockProgressTrack}>
        <View
          style={[
            styles.rockProgressFill,
            { width: `${pct}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      {statusLabel && (
        <Text style={[styles.rockStatus, { color: barColor }]}>{statusLabel}</Text>
      )}
    </Card>
  );
}

function NextTodoCard({ todo }: { todo: import('@/lib/eosService').EosTodo }) {
  const due = formatDueLabel(todo.due_date);
  const dueColor = due.overdue
    ? colors.rose
    : due.soon
      ? colors.amber
      : colors.textSecondary;
  return (
    <Card variant="flat" style={styles.rockCard}>
      <View style={styles.rockHeader}>
        <Clock size={14} color={dueColor} strokeWidth={2} style={{ marginRight: spacing.xs }} />
        <Text style={styles.rockTitle} numberOfLines={1}>
          {todo.task}
        </Text>
      </View>
      <Text style={[styles.rockStatus, { color: dueColor }]}>{due.label}</Text>
    </Card>
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

  // Home header (flush-left, LIFTORI wordmark + greeting)
  homeHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  wordmark: {
    ...typography.h2,
    color: colors.emerald,
    fontWeight: '800',
    letterSpacing: 2,
  },
  greetingTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  greetingSub: {
    ...typography.body,
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

  // EOS section
  rockList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rockCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rockTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  rockPct: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  rockProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface800,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  rockProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  rockStatus: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: 4,
  },
});
