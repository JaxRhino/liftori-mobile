/**
 * Work tab — "everything assigned to me."
 *
 * Two segments:
 *   • Leads — my open sales_leads grouped by product (LABOS / Consulting / Builds)
 *   • Tasks — next-action items across my open leads, sorted by date
 *
 * Taps deep-link to `/lead/:id` — the Wave 6 mobile detail screen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Briefcase,
  CalendarClock,
  ChevronRight,
  Inbox,
  ListChecks,
  Target,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import {
  Lead,
  PRODUCTS,
  PRODUCT_KEYS,
  ProductKey,
  formatMoney,
  isClosedStage,
  listLeads,
  stageMetaFor,
  summarize,
} from '@/lib/leadsService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Segment = 'leads' | 'tasks';

export default function WorkScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      const all = await listLeads({ includeClosed: false });
      // "My" leads = assigned to me OR unassigned
      const mine = all.filter((l) => !l.assigned_to || l.assigned_to === user?.id);
      setLeads(mine);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[work] listLeads failed:', e);
    }
  }, [user?.id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchLeads();
      setLoading(false);
    })();
  }, [fetchLeads]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeads();
    setRefreshing(false);
  }, [fetchLeads]);

  const summary = summarize(leads);

  const groupedByProduct = useMemo(() => {
    const out: Record<ProductKey, Lead[]> = {
      labos: [],
      consulting: [],
      custom_build: [],
    };
    for (const l of leads) {
      if (!isClosedStage(l.stage)) out[l.product_type].push(l);
    }
    return out;
  }, [leads]);

  const tasks = useMemo(() => {
    return leads
      .filter((l) => !isClosedStage(l.stage) && l.next_action_date)
      .slice()
      .sort((a, b) => (a.next_action_date! < b.next_action_date! ? -1 : 1));
  }, [leads]);

  const openLead = (id: string) => {
    haptics.tap();
    router.push(`/lead/${id}` as any);
  };

  return (
    <SafeScreen bottom="skip" scroll onRefresh={onRefresh} refreshing={refreshing}>
      <Header title="Work" subtitle="Everything on your plate" />

      <View style={styles.body}>
        {/* Totals banner */}
        <Card variant="elevated" style={styles.banner}>
          <View style={styles.bannerRow}>
            <BannerStat
              icon={<Target size={16} color={colors.sky} />}
              label="Open"
              value={String(summary.openCount)}
            />
            <View style={styles.bannerSep} />
            <BannerStat
              icon={<Briefcase size={16} color={colors.emerald} />}
              label="Weighted"
              value={formatMoney(summary.openWeightedCents)}
            />
            <View style={styles.bannerSep} />
            <BannerStat
              icon={<ListChecks size={16} color={colors.amber} />}
              label="Tasks"
              value={String(tasks.length)}
            />
          </View>
        </Card>

        {/* Segmented control */}
        <View style={styles.segment}>
          {(['leads', 'tasks'] as Segment[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                haptics.select();
                setSegment(s);
              }}
              style={[styles.segmentBtn, segment === s && styles.segmentBtnActive]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  segment === s && styles.segmentLabelActive,
                ]}
              >
                {s === 'leads' ? 'Leads' : 'Tasks'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Body */}
        {loading ? (
          <Card variant="flat" style={styles.emptyCard}>
            <Text style={styles.muted}>Loading…</Text>
          </Card>
        ) : segment === 'leads' ? (
          <LeadsView grouped={groupedByProduct} onOpen={openLead} />
        ) : (
          <TasksView tasks={tasks} onOpen={openLead} />
        )}
      </View>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Leads view
// ═══════════════════════════════════════════════════════════════════════

function LeadsView({
  grouped,
  onOpen,
}: {
  grouped: Record<ProductKey, Lead[]>;
  onOpen: (id: string) => void;
}) {
  const totalOpen = PRODUCT_KEYS.reduce((n, k) => n + grouped[k].length, 0);
  if (totalOpen === 0) {
    return (
      <Card variant="outline" style={styles.emptyCard}>
        <EmptyState
          compact
          icon={<Inbox size={24} color={colors.textMuted} />}
          title="No open leads"
          description="When leads get assigned to you (or left unassigned in the pool), they'll show up here."
        />
      </Card>
    );
  }
  return (
    <View style={{ gap: spacing.lg }}>
      {PRODUCT_KEYS.map((key) => {
        const bucket = grouped[key];
        if (bucket.length === 0) return null;
        const meta = PRODUCTS[key];
        const accent = productAccent(meta.color);
        return (
          <View key={key} style={{ gap: spacing.sm }}>
            <View style={styles.groupHeader}>
              <View style={[styles.groupDot, { backgroundColor: accent }]} />
              <Text style={styles.groupTitle}>{meta.label}</Text>
              <Text style={styles.groupCount}>{bucket.length}</Text>
            </View>
            {bucket.slice(0, 10).map((lead) => (
              <LeadRow key={lead.id} lead={lead} onPress={() => onOpen(lead.id)} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tasks view
// ═══════════════════════════════════════════════════════════════════════

function TasksView({
  tasks,
  onOpen,
}: {
  tasks: Lead[];
  onOpen: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <Card variant="outline" style={styles.emptyCard}>
        <EmptyState
          compact
          icon={<CalendarClock size={24} color={colors.textMuted} />}
          title="No scheduled tasks"
          description="Set next-action dates on your leads to see them here in date order."
        />
      </Card>
    );
  }

  const today = todayISODate();

  return (
    <View style={{ gap: spacing.sm }}>
      {tasks.map((lead) => {
        const late = lead.next_action_date! < today;
        const isToday = lead.next_action_date === today;
        const color = late ? colors.rose : isToday ? colors.amber : colors.sky;
        return (
          <Card
            key={lead.id}
            variant="flat"
            onPress={() => onOpen(lead.id)}
            accent={color}
            style={styles.leadCard}
          >
            <View style={styles.leadRow}>
              <View style={styles.leadMain}>
                <Text style={styles.leadTitle} numberOfLines={1}>
                  {lead.next_action || 'Follow up'}
                </Text>
                <Text style={styles.leadSub} numberOfLines={1}>
                  {lead.title} · {lead.company_name || lead.contact_name || '—'}
                </Text>
              </View>
              <View style={styles.dateBlock}>
                <Text style={[styles.dateText, { color }]}>
                  {formatDateShort(lead.next_action_date!)}
                </Text>
                {late && <Text style={styles.dateTag}>late</Text>}
                {isToday && !late && <Text style={styles.dateTag}>today</Text>}
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Shared row
// ═══════════════════════════════════════════════════════════════════════

function LeadRow({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const meta = stageMetaFor(lead.product_type, lead.stage);
  const money =
    (lead.deal_value_cents || 0) > 0
      ? formatMoney(lead.deal_value_cents)
      : (lead.mrr_cents || 0) > 0
        ? `${formatMoney(lead.mrr_cents)}/mo`
        : null;
  return (
    <Card variant="flat" onPress={onPress} style={styles.leadCard}>
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
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

function BannerStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.bannerStat}>
      <View style={styles.bannerStatHeader}>
        {icon}
        <Text style={styles.bannerStatLabel}>{label}</Text>
      </View>
      <Text style={styles.bannerStatValue}>{value}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function productAccent(color: string): string {
  switch (color) {
    case 'sky':    return colors.sky;
    case 'amber':  return colors.amber;
    case 'violet': return colors.purple;
    default:       return colors.emerald;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyCard: {
    paddingVertical: spacing.md,
  },

  // Banner
  banner: {
    padding: 0,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  bannerStat: {
    flex: 1,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  bannerStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bannerStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bannerStatValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  bannerSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },

  // Segmented control
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface800,
    borderRadius: radii.pill,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.surface700,
  },
  segmentLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
  },

  // Group header
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  groupTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  groupCount: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Lead card
  leadCard: {
    padding: 0,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // Tasks date block
  dateBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  dateText: {
    ...typography.bodyMedium,
    fontVariant: ['tabular-nums'],
  },
  dateTag: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});
