/**
 * Lead detail — the actionable view behind a row tap in Work/Home.
 *
 * Lets the owner (or anyone in the pool if unassigned) advance the stage,
 * edit the next action, jot notes, dial/email the contact, claim the lead,
 * and close it out (Mark Lost / Delete). Writes are optimistic — we snapshot
 * the current lead before mutating, then revert on error.
 *
 * Route: `/lead/:id`
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Briefcase,
  Calendar,
  Code,
  Cpu,
  Hand,
  Mail,
  Phone,
  Target,
  Trash2,
  TrendingDown,
  User,
} from 'lucide-react-native';

import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';

import { useAuth } from '@/lib/AuthContext';
import {
  Lead,
  PRODUCTS,
  ProductKey,
  deleteLead,
  formatMoney,
  getLead,
  isClosedStage,
  moveLeadStage,
  stagesFor,
  stageMetaFor,
  updateLead,
  weightedValueCents,
} from '@/lib/leadsService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

// ═══════════════════════════════════════════════════════════════════════
// Screen
// ═══════════════════════════════════════════════════════════════════════

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const row = await getLead(id);
      setLead(row);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Optimistic patch — snapshot, apply locally, fire update, revert on error.
  const patch = useCallback(
    async (updates: Record<string, unknown>, onErrorLabel: string) => {
      if (!lead) return;
      const snapshot = lead;
      setLead({ ...lead, ...updates } as Lead);
      try {
        const updated = await updateLead(lead.id, updates);
        setLead(updated);
      } catch (e) {
        setLead(snapshot);
        haptics.error();
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(onErrorLabel, msg);
      }
    },
    [lead],
  );

  const advanceStage = useCallback(
    async (newStage: string) => {
      if (!lead || newStage === lead.stage) return;
      const snapshot = lead;
      setLead({ ...lead, stage: newStage, stage_changed_at: new Date().toISOString() });
      haptics.bump();
      try {
        const updated = await moveLeadStage(lead.id, newStage);
        setLead(updated);
        if (newStage === 'won') haptics.success();
      } catch (e) {
        setLead(snapshot);
        haptics.error();
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Stage change failed', msg);
      }
    },
    [lead],
  );

  const confirmStage = useCallback(
    (newStage: string, label: string) => {
      if (!lead || newStage === lead.stage) return;
      // Closed stages and going-backward get a confirm. Forward moves are one-tap.
      const current = stagesFor(lead.product_type);
      const fromIdx = current.findIndex((s) => s.key === lead.stage);
      const toIdx = current.findIndex((s) => s.key === newStage);
      const needsConfirm =
        newStage === 'won' || newStage === 'lost' || toIdx < fromIdx;
      if (!needsConfirm) {
        void advanceStage(newStage);
        return;
      }
      Alert.alert(
        `Move to ${label}?`,
        newStage === 'won'
          ? 'This closes the lead as Won.'
          : newStage === 'lost'
            ? 'This closes the lead as Lost.'
            : 'Moving a lead backward is unusual — confirm?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: newStage === 'lost' ? 'Mark Lost' : 'Confirm',
            style: newStage === 'lost' ? 'destructive' : 'default',
            onPress: () => void advanceStage(newStage),
          },
        ],
      );
    },
    [lead, advanceStage],
  );

  const onClaim = useCallback(async () => {
    if (!lead || !user) return;
    haptics.bump();
    await patch({ assigned_to: user.id }, 'Claim failed');
  }, [lead, user, patch]);

  const onUnclaim = useCallback(async () => {
    if (!lead) return;
    Alert.alert(
      'Release back to pool?',
      'This lead will become available for anyone on the team to claim.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            haptics.thud();
            await patch({ assigned_to: null }, 'Release failed');
          },
        },
      ],
    );
  }, [lead, patch]);

  const onDelete = useCallback(() => {
    if (!lead) return;
    Alert.alert(
      'Delete this lead?',
      `"${lead.title}" will be permanently removed. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            haptics.thud();
            try {
              await deleteLead(lead.id);
              haptics.success();
              router.back();
            } catch (e) {
              haptics.error();
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert('Delete failed', msg);
            }
          },
        },
      ],
    );
  }, [lead, router]);

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeScreen bottom="apply">
        <Header title="Lead" onBack={() => router.back()} />
        <View style={styles.centerBody}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </SafeScreen>
    );
  }

  if (error || !lead) {
    return (
      <SafeScreen bottom="apply">
        <Header title="Lead" onBack={() => router.back()} />
        <View style={styles.centerBody}>
          <EmptyState
            icon={<Target size={28} color={colors.textMuted} />}
            title="Lead not found"
            description={error || 'This lead may have been deleted or moved out of your scope.'}
            action={<Button label="Go back" variant="outline" onPress={() => router.back()} />}
          />
        </View>
      </SafeScreen>
    );
  }

  const meta = PRODUCTS[lead.product_type];
  const accent = productAccent(meta.color);
  const stageMeta = stageMetaFor(lead.product_type, lead.stage);
  const closed = isClosedStage(lead.stage);
  const isMine = !!user && lead.assigned_to === user.id;

  return (
    <SafeScreen bottom="apply" scroll onRefresh={onRefresh} refreshing={refreshing}>
      <Header
        title={lead.title}
        subtitle={lead.company_name || lead.contact_name || meta.label}
        onBack={() => router.back()}
      />

      <View style={styles.body}>
        {/* Hero — product + stage pill + money */}
        <HeroBlock lead={lead} accent={accent} stageLabel={stageMeta.label} productLabel={meta.label} />

        {/* Stage rail */}
        <Section title="Stage">
          <StageRail
            productType={lead.product_type}
            currentStage={lead.stage}
            accent={accent}
            onPick={confirmStage}
            disabled={closed && lead.stage === 'won'}
          />
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <ContactBlock lead={lead} />
        </Section>

        {/* Next action */}
        <Section title="Next action">
          <NextActionBlock lead={lead} onPatch={patch} />
        </Section>

        {/* Assignment */}
        <Section title="Owner">
          <AssignmentBlock
            lead={lead}
            isMine={isMine}
            onClaim={onClaim}
            onUnclaim={onUnclaim}
          />
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <NotesBlock lead={lead} onPatch={patch} />
        </Section>

        {/* Description (read-only, captured at wizard time) */}
        {lead.description ? (
          <Section title="Description">
            <Card variant="flat">
              <Text style={styles.bodyText}>{lead.description}</Text>
            </Card>
          </Section>
        ) : null}

        {/* Metadata */}
        <Section title="Details">
          <MetaBlock lead={lead} />
        </Section>

        {/* Destructive actions */}
        <Section title="Danger zone">
          <View style={{ gap: spacing.sm }}>
            {!closed ? (
              <Button
                label="Mark lost"
                variant="outline"
                icon={<TrendingDown size={16} color={colors.rose} />}
                onPress={() => confirmStage('lost', 'Lost')}
                hapticStyle="thud"
              />
            ) : null}
            <Button
              label="Delete lead"
              variant="destructive"
              icon={<Trash2 size={16} color={colors.textOnAccent} />}
              onPress={onDelete}
              hapticStyle="thud"
            />
          </View>
        </Section>
      </View>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════════════

function HeroBlock({
  lead,
  accent,
  stageLabel,
  productLabel,
}: {
  lead: Lead;
  accent: string;
  stageLabel: string;
  productLabel: string;
}) {
  const deal = lead.deal_value_cents || 0;
  const mrr = lead.mrr_cents || 0;
  const weighted = weightedValueCents(lead);
  const Icon = productIcon(lead.product_type);

  return (
    <Card variant="elevated" accent={accent}>
      <View style={styles.heroRow}>
        <View style={[styles.heroIconWrap, { backgroundColor: withAlpha(accent, 0.15) }]}>
          <Icon size={22} color={accent} />
        </View>
        <View style={styles.heroBody}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {productLabel.toUpperCase()}
          </Text>
          <View style={[styles.stagePill, { backgroundColor: withAlpha(accent, 0.18) }]}>
            <Text style={[styles.stagePillText, { color: accent }]}>{stageLabel}</Text>
          </View>
        </View>
      </View>

      {(deal > 0 || mrr > 0) && (
        <View style={styles.moneyRow}>
          {deal > 0 ? (
            <MoneyStat label="Deal value" value={formatMoney(deal)} />
          ) : null}
          {mrr > 0 ? (
            <MoneyStat label="MRR" value={`${formatMoney(mrr)}/mo`} />
          ) : null}
          {weighted > 0 ? (
            <MoneyStat label="Weighted" value={formatMoney(weighted)} muted />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function MoneyStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.moneyStat}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          typography.h3,
          { color: muted ? colors.textSecondary : colors.textPrimary, marginTop: 2 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Stage rail
// ═══════════════════════════════════════════════════════════════════════

function StageRail({
  productType,
  currentStage,
  accent,
  onPick,
  disabled,
}: {
  productType: ProductKey;
  currentStage: string;
  accent: string;
  onPick: (key: string, label: string) => void;
  disabled?: boolean;
}) {
  const list = stagesFor(productType);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stageRail}
    >
      {list.map((s) => (
        <Chip
          key={s.key}
          label={s.label}
          selected={s.key === currentStage}
          accent={accent}
          onPress={() => onPick(s.key, s.label)}
          disabled={disabled}
        />
      ))}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Contact
// ═══════════════════════════════════════════════════════════════════════

function ContactBlock({ lead }: { lead: Lead }) {
  const name = lead.contact_name;
  const company = lead.company_name;
  const email = lead.contact_email;
  const phone = lead.contact_phone;

  const dial = (num: string) => {
    haptics.bump();
    void Linking.openURL(`tel:${num}`);
  };
  const mail = (addr: string) => {
    haptics.bump();
    void Linking.openURL(`mailto:${addr}`);
  };

  if (!name && !company && !email && !phone) {
    return (
      <Card variant="outline">
        <Text style={styles.muted}>No contact details on this lead.</Text>
      </Card>
    );
  }

  return (
    <Card variant="flat">
      <View style={{ gap: spacing.md }}>
        {name || company ? (
          <View style={styles.contactRow}>
            <User size={16} color={colors.textMuted} />
            <View style={styles.contactCopy}>
              {name ? <Text style={styles.bodyText}>{name}</Text> : null}
              {company ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {company}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {phone ? (
          <Pressable
            onPress={() => dial(phone)}
            style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Call ${phone}`}
          >
            <Phone size={16} color={colors.sky} />
            <Text style={[styles.bodyText, { color: colors.sky }]}>{phone}</Text>
          </Pressable>
        ) : null}

        {email ? (
          <Pressable
            onPress={() => mail(email)}
            style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Email ${email}`}
          >
            <Mail size={16} color={colors.sky} />
            <Text style={[styles.bodyText, { color: colors.sky }]}>{email}</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Next action
// ═══════════════════════════════════════════════════════════════════════

function NextActionBlock({
  lead,
  onPatch,
}: {
  lead: Lead;
  onPatch: (u: Record<string, unknown>, label: string) => Promise<void>;
}) {
  const [text, setText] = useState(lead.next_action || '');

  useEffect(() => {
    setText(lead.next_action || '');
  }, [lead.next_action]);

  const quickDates: { label: string; offset: number }[] = [
    { label: 'Today', offset: 0 },
    { label: 'Tomorrow', offset: 1 },
    { label: '+3 days', offset: 3 },
    { label: '+1 week', offset: 7 },
  ];

  const setDate = async (offset: number | null) => {
    const iso = offset === null ? null : addDaysISO(offset);
    await onPatch({ next_action_date: iso }, 'Date save failed');
  };

  const saveText = async () => {
    const clean = text.trim() || null;
    if (clean === (lead.next_action || null)) return;
    await onPatch({ next_action: clean }, 'Next action save failed');
  };

  return (
    <Card variant="flat">
      <View style={{ gap: spacing.md }}>
        <Input
          label="What happens next?"
          placeholder="e.g. Send proposal, call back Friday"
          value={text}
          onChangeText={setText}
          onBlur={() => void saveText()}
          returnKeyType="done"
          placeholderTextColor={colors.textMuted}
        />

        <View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            Due
          </Text>
          <View style={styles.dateChipRow}>
            {quickDates.map((q) => (
              <Chip
                key={q.label}
                label={q.label}
                accent={colors.sky}
                selected={lead.next_action_date === addDaysISO(q.offset)}
                onPress={() => void setDate(q.offset)}
                size="sm"
              />
            ))}
            {lead.next_action_date ? (
              <Chip
                label="Clear"
                accent={colors.rose}
                onPress={() => void setDate(null)}
                size="sm"
              />
            ) : null}
          </View>
          {lead.next_action_date ? (
            <View style={styles.dueRow}>
              <Calendar size={14} color={colors.textMuted} />
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {formatDateLong(lead.next_action_date)}
              </Text>
            </View>
          ) : (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
              No date set.
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Assignment
// ═══════════════════════════════════════════════════════════════════════

function AssignmentBlock({
  lead,
  isMine,
  onClaim,
  onUnclaim,
}: {
  lead: Lead;
  isMine: boolean;
  onClaim: () => void;
  onUnclaim: () => void;
}) {
  if (!lead.assigned_to) {
    return (
      <Card variant="outline">
        <View style={styles.assignRow}>
          <View style={styles.assignCopy}>
            <Text style={styles.bodyText}>Unassigned</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              In the pool — claim to own it.
            </Text>
          </View>
          <Button
            label="Claim"
            size="sm"
            icon={<Hand size={14} color={colors.textOnAccent} />}
            onPress={onClaim}
            hapticStyle="bump"
          />
        </View>
      </Card>
    );
  }

  const assignee = lead.assignee;
  return (
    <Card variant="flat">
      <View style={styles.assignRow}>
        <View style={styles.assigneeRow}>
          <Avatar
            name={assignee?.full_name || assignee?.email || 'User'}
            url={assignee?.avatar_url || null}
            size="sm"
          />
          <View style={styles.assignCopy}>
            <Text style={styles.bodyText}>
              {assignee?.full_name || assignee?.email || 'Assigned'}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              {isMine ? 'That’s you' : 'Owner'}
            </Text>
          </View>
        </View>
        {isMine ? (
          <Button
            label="Release"
            variant="ghost"
            size="sm"
            onPress={onUnclaim}
            hapticStyle="thud"
          />
        ) : null}
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Notes
// ═══════════════════════════════════════════════════════════════════════

function NotesBlock({
  lead,
  onPatch,
}: {
  lead: Lead;
  onPatch: (u: Record<string, unknown>, label: string) => Promise<void>;
}) {
  const [text, setText] = useState(lead.notes || '');

  useEffect(() => {
    setText(lead.notes || '');
  }, [lead.notes]);

  const save = async () => {
    const clean = text.trim() || null;
    if (clean === (lead.notes || null)) return;
    await onPatch({ notes: clean }, 'Notes save failed');
  };

  return (
    <Card variant="flat">
      <Input
        placeholder="Jot context, objections, pricing signals…"
        value={text}
        onChangeText={setText}
        onBlur={() => void save()}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        placeholderTextColor={colors.textMuted}
        inputStyle={styles.notesInput}
      />
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Metadata (read-only)
// ═══════════════════════════════════════════════════════════════════════

function MetaBlock({ lead }: { lead: Lead }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Source', value: lead.source ? titleCase(lead.source) : '—' },
    { label: 'Probability', value: `${lead.probability ?? 0}%` },
    {
      label: 'Expected close',
      value: lead.expected_close_date ? formatDateLong(lead.expected_close_date) : '—',
    },
    { label: 'Created', value: formatDateLong(lead.created_at) },
    { label: 'Stage changed', value: formatDateLong(lead.stage_changed_at) },
  ];

  return (
    <Card variant="flat">
      <View style={{ gap: spacing.sm }}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.metaRow, i > 0 && styles.metaRowBorder]}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              {r.label}
            </Text>
            <Text style={[typography.body, { color: colors.textPrimary }]}>
              {r.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Section wrapper
// ═══════════════════════════════════════════════════════════════════════

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function addDaysISO(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLong(iso: string): string {
  try {
    const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function productIcon(key: ProductKey) {
  switch (key) {
    case 'labos':
      return Cpu;
    case 'consulting':
      return Briefcase;
    case 'custom_build':
      return Code;
  }
}

function productAccent(color: string): string {
  switch (color) {
    case 'sky':
      return colors.sky;
    case 'amber':
      return colors.amber;
    case 'violet':
      return colors.purple;
    default:
      return colors.emerald;
  }
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },

  // Section
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginLeft: spacing.xs,
  },

  // Hero
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    flex: 1,
    gap: spacing.xs,
  },
  stagePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  stagePillText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },

  moneyRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  moneyStat: {
    minWidth: 88,
  },

  // Stage rail
  stageRail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },

  // Contact
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactCopy: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },

  // Next action / dates
  dateChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },

  // Assignment
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  assignCopy: {
    flex: 1,
    gap: 2,
  },

  // Notes
  notesInput: {
    minHeight: 96,
    paddingTop: spacing.sm,
  },

  // Meta rows
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  metaRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
