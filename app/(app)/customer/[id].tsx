/**
 * Customer detail — single customer CRM view.
 *
 * Tabs:
 *   • Timeline   — reverse-chron customer_activities + inline "log" composer
 *   • Follow-ups — open + completed customer_follow_ups with quick complete
 *   • Info       — profile fields: contact, company, notes, tags
 *
 * Stage + temperature controls live in a sticky header block so they can
 * be changed from any tab. Tapping a stage/temp chip updates the profile
 * row instantly with an optimistic refresh.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Cog,
  DollarSign,
  Flame,
  Globe,
  Heart,
  Mail,
  MessageSquare,
  Monitor,
  NotebookPen,
  Phone,
  Snowflake,
  Tag,
  Thermometer,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  CRM_STAGES,
  CUSTOMER_SOURCES,
  CrmStage,
  Customer,
  CustomerSource,
  TEMPERATURES,
  Temperature,
  displayName,
  fetchCustomer,
  formatEstimatedValue,
  formatRelativeTime,
  stageMeta,
  temperatureMeta,
  updateCustomer,
} from '@/lib/customersService';
import {
  ACTIVITY_TYPES,
  ActivityType,
  CustomerActivity,
  activityTypeMeta,
  createActivity,
  deleteActivity,
  listActivities,
} from '@/lib/customerActivitiesService';
import {
  CustomerFollowUp,
  FOLLOW_UP_PRIORITIES,
  FOLLOW_UP_TYPES,
  FollowUpPriority,
  FollowUpType,
  completeFollowUp,
  createFollowUp,
  deleteFollowUp,
  formatDueLabel,
  listCustomerFollowUps,
  priorityMeta,
} from '@/lib/customerFollowUpsService';

type TabKey = 'timeline' | 'followups' | 'info';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'info', label: 'Info' },
];

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [followUps, setFollowUps] = useState<CustomerFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('timeline');
  const [activityOpen, setActivityOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, acts, fups] = await Promise.all([
        fetchCustomer(id),
        listActivities(id, 200),
        listCustomerFollowUps(id, { includeCompleted: true }),
      ]);
      setCustomer(c);
      setActivities(acts);
      setFollowUps(fups);
    } catch (e: any) {
      console.warn('[customer detail] load failed', e);
      Alert.alert('Could not load customer', e?.message ?? '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleStageChange = async (next: CrmStage) => {
    if (!customer || customer.crm_stage === next) return;
    const prev = customer.crm_stage;
    setCustomer({ ...customer, crm_stage: next }); // optimistic
    try {
      await updateCustomer(customer.id, { crm_stage: next });
      // Log an activity line for the move.
      await createActivity({
        customer_id: customer.id,
        type: 'status_change',
        title: `Stage: ${stageMeta(prev).label} → ${stageMeta(next).label}`,
      });
      void load();
    } catch (e: any) {
      setCustomer({ ...customer, crm_stage: prev });
      Alert.alert('Could not update stage', e?.message ?? '');
    }
  };

  const handleTempChange = async (next: Temperature) => {
    if (!customer || customer.lead_temperature === next) return;
    const prev = customer.lead_temperature;
    setCustomer({ ...customer, lead_temperature: next });
    try {
      await updateCustomer(customer.id, { lead_temperature: next });
    } catch (e: any) {
      setCustomer({ ...customer, lead_temperature: prev });
      Alert.alert('Could not update temperature', e?.message ?? '');
    }
  };

  const handleLogActivity = async (payload: { type: ActivityType; title: string; description: string }) => {
    if (!customer) return;
    try {
      await createActivity({
        customer_id: customer.id,
        type: payload.type,
        title: payload.title,
        description: payload.description || null,
      });
      setActivityOpen(false);
      void load();
    } catch (e: any) {
      Alert.alert('Could not log activity', e?.message ?? '');
    }
  };

  const handleScheduleFollowUp = async (payload: {
    type: FollowUpType;
    title: string;
    description: string;
    due_at: string;
    priority: FollowUpPriority;
  }) => {
    if (!customer) return;
    try {
      await createFollowUp({
        customer_id: customer.id,
        type: payload.type,
        title: payload.title,
        description: payload.description || null,
        due_at: payload.due_at,
        priority: payload.priority,
      });
      setFollowUpOpen(false);
      void load();
    } catch (e: any) {
      Alert.alert('Could not schedule follow-up', e?.message ?? '');
    }
  };

  const handleCompleteFollowUp = async (fu: CustomerFollowUp) => {
    try {
      setFollowUps((cur) => cur.map((x) => (x.id === fu.id ? { ...x, completed_at: new Date().toISOString() } : x)));
      await completeFollowUp(fu.id);
      // Log it to the timeline too.
      if (customer) {
        await createActivity({
          customer_id: customer.id,
          type: 'follow_up',
          title: `Completed: ${fu.title}`,
        });
      }
      void load();
    } catch (e: any) {
      Alert.alert('Could not complete follow-up', e?.message ?? '');
      void load();
    }
  };

  const handleInfoSave = async (patch: Partial<Customer>) => {
    if (!customer) return;
    try {
      const saved = await updateCustomer(customer.id, {
        full_name: patch.full_name ?? undefined,
        first_name: patch.first_name ?? undefined,
        last_name: patch.last_name ?? undefined,
        phone: patch.phone ?? undefined,
        title: patch.title ?? undefined,
        company_name: patch.company_name ?? undefined,
        company_website: patch.company_website ?? undefined,
        company_industry: patch.company_industry ?? undefined,
        estimated_value: patch.estimated_value ?? undefined,
        source: patch.source ?? undefined,
        tags: patch.tags ?? undefined,
        internal_notes: patch.internal_notes ?? undefined,
      });
      setCustomer(saved);
      setEditOpen(false);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? '');
    }
  };

  if (loading) {
    return (
      <SafeScreen>
        <Header title="Customer" onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.emerald} />
        </View>
      </SafeScreen>
    );
  }

  if (!customer) {
    return (
      <SafeScreen>
        <Header title="Customer" onBack={() => router.back()} />
        <EmptyState
          icon={<Users size={28} color={colors.textSecondary} />}
          title="Customer not found"
          description="This record may have been removed."
          action={<Button label="Go back" variant="secondary" onPress={() => router.back()} />}
        />
      </SafeScreen>
    );
  }

  const stage = stageMeta(customer.crm_stage);
  const temp = temperatureMeta(customer.lead_temperature);
  const openFollowUps = followUps.filter((f) => !f.completed_at);
  const completedFollowUps = followUps.filter((f) => f.completed_at);

  return (
    <SafeScreen>
      <Header
        title={displayName(customer)}
        subtitle={customer.company_name ?? customer.email}
        onBack={() => router.back()}
        trailing={
          <Pressable
            onPress={() => {
              haptics.bump();
              setEditOpen(true);
            }}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          >
            <Cog size={20} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Profile hero */}
        <Card accent={stage.hex} style={{ marginBottom: spacing.md }}>
          <View style={styles.heroRow}>
            <Avatar name={displayName(customer)} url={customer.avatar_url} size="lg" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroName} numberOfLines={1}>
                {displayName(customer)}
              </Text>
              {customer.title ? (
                <Text style={styles.heroSub} numberOfLines={1}>{customer.title}</Text>
              ) : null}
              {customer.company_name ? (
                <View style={styles.heroLine}>
                  <Building2 size={13} color={colors.textSecondary} />
                  <Text style={styles.heroSub} numberOfLines={1}>{customer.company_name}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Quick contact actions */}
          <View style={styles.heroActions}>
            {customer.email ? (
              <QuickAction
                icon={<Mail size={14} color={colors.sky} />}
                label="Email"
                onPress={() => Linking.openURL(`mailto:${customer.email}`).catch(() => {})}
              />
            ) : null}
            {customer.phone ? (
              <QuickAction
                icon={<Phone size={14} color={colors.emerald} />}
                label="Call"
                onPress={() => Linking.openURL(`tel:${customer.phone}`).catch(() => {})}
              />
            ) : null}
            {customer.phone ? (
              <QuickAction
                icon={<MessageSquare size={14} color={colors.indigo} />}
                label="Text"
                onPress={() => Linking.openURL(`sms:${customer.phone}`).catch(() => {})}
              />
            ) : null}
            {customer.company_website ? (
              <QuickAction
                icon={<Globe size={14} color={colors.purple} />}
                label="Website"
                onPress={() => Linking.openURL(customer.company_website!).catch(() => {})}
              />
            ) : null}
          </View>

          {/* Stats strip */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatEstimatedValue(customer.estimated_value)}</Text>
              <Text style={styles.heroStatLabel}>Est. value</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{customer.lead_score || 0}</Text>
              <Text style={styles.heroStatLabel}>Score</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1}>
                {formatRelativeTime(customer.last_activity_at)}
              </Text>
              <Text style={styles.heroStatLabel}>Last activity</Text>
            </View>
          </View>
        </Card>

        {/* Stage selector */}
        <Text style={styles.sectionLabel}>Pipeline stage</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CRM_STAGES.map((s) => {
            const active = customer.crm_stage === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  haptics.select();
                  handleStageChange(s.key);
                }}
                style={[
                  styles.chip,
                  active && { backgroundColor: s.hex + '22', borderColor: s.hex },
                ]}
              >
                <Text style={[styles.chipText, active && { color: s.hex, fontWeight: '700' }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Temperature selector */}
        <Text style={styles.sectionLabel}>Temperature</Text>
        <View style={styles.tempRow}>
          {TEMPERATURES.map((t) => {
            const active = customer.lead_temperature === t.key;
            const Icon = t.icon === 'flame' ? Flame : t.icon === 'thermometer' ? Thermometer : Snowflake;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  haptics.select();
                  handleTempChange(t.key);
                }}
                style={[
                  styles.tempOption,
                  active && { backgroundColor: t.hex + '22', borderColor: t.hex },
                ]}
              >
                <Icon size={14} color={active ? t.hex : colors.textSecondary} />
                <Text style={[styles.tempOptionText, active && { color: t.hex, fontWeight: '700' }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  haptics.select();
                  setTab(t.key);
                }}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                {t.key === 'followups' && openFollowUps.length > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{openFollowUps.length}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Tab body */}
        {tab === 'timeline' ? (
          <View>
            <View style={styles.inlineActionRow}>
              <Button
                label="Log activity"
                variant="primary"
                size="md"
                icon={<NotebookPen size={14} color={colors.textOnAccent} />}
                onPress={() => {
                  haptics.bump();
                  setActivityOpen(true);
                }}
                style={{ flex: 1 }}
              />
            </View>

            {activities.length === 0 ? (
              <EmptyState
                compact
                icon={<NotebookPen size={24} color={colors.textSecondary} />}
                title="No activity yet"
                description="Log a call, email, meeting, or note to start this customer's timeline."
              />
            ) : (
              activities.map((a) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  onDelete={async () => {
                    try {
                      await deleteActivity(a.id);
                      setActivities((cur) => cur.filter((x) => x.id !== a.id));
                    } catch (e: any) {
                      Alert.alert('Could not delete', e?.message ?? '');
                    }
                  }}
                />
              ))
            )}
          </View>
        ) : null}

        {tab === 'followups' ? (
          <View>
            <View style={styles.inlineActionRow}>
              <Button
                label="Schedule follow-up"
                variant="primary"
                size="md"
                icon={<Bell size={14} color={colors.textOnAccent} />}
                onPress={() => {
                  haptics.bump();
                  setFollowUpOpen(true);
                }}
                style={{ flex: 1 }}
              />
            </View>

            {openFollowUps.length === 0 && completedFollowUps.length === 0 ? (
              <EmptyState
                compact
                icon={<Bell size={24} color={colors.textSecondary} />}
                title="No follow-ups scheduled"
                description="Schedule a task to keep this customer moving through the pipeline."
              />
            ) : (
              <>
                {openFollowUps.length > 0 ? (
                  <Text style={styles.sectionLabel}>Open ({openFollowUps.length})</Text>
                ) : null}
                {openFollowUps.map((fu) => (
                  <FollowUpRow
                    key={fu.id}
                    followUp={fu}
                    onComplete={() => handleCompleteFollowUp(fu)}
                    onDelete={async () => {
                      try {
                        await deleteFollowUp(fu.id);
                        setFollowUps((cur) => cur.filter((x) => x.id !== fu.id));
                      } catch (e: any) {
                        Alert.alert('Could not delete', e?.message ?? '');
                      }
                    }}
                  />
                ))}

                {completedFollowUps.length > 0 ? (
                  <Text style={styles.sectionLabel}>Completed ({completedFollowUps.length})</Text>
                ) : null}
                {completedFollowUps.map((fu) => (
                  <FollowUpRow key={fu.id} followUp={fu} readOnly />
                ))}
              </>
            )}
          </View>
        ) : null}

        {tab === 'info' ? <InfoPanel customer={customer} /> : null}
      </ScrollView>

      <ActivitySheet
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        onSave={handleLogActivity}
      />
      <FollowUpSheet
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        onSave={handleScheduleFollowUp}
      />
      <EditCustomerSheet
        open={editOpen}
        customer={customer}
        onClose={() => setEditOpen(false)}
        onSave={handleInfoSave}
      />
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Quick action pill
// ═══════════════════════════════════════════════════════════════════════

function QuickAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Activity row
// ═══════════════════════════════════════════════════════════════════════

function ActivityRow({ activity, onDelete }: { activity: CustomerActivity; onDelete: () => void }) {
  const meta = activityTypeMeta(activity.type);
  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={styles.timelineRow}>
        <View style={[styles.timelineIcon, { backgroundColor: meta.hex + '22', borderColor: meta.hex }]}>
          <ActivityIcon name={meta.icon} color={meta.hex} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.timelineTitle} numberOfLines={2}>{activity.title}</Text>
          {activity.description ? (
            <Text style={styles.timelineBody}>{activity.description}</Text>
          ) : null}
          <View style={styles.timelineMeta}>
            <Text style={styles.metaText}>{meta.label}</Text>
            <Text style={styles.metaText}>· {formatRelativeTime(activity.created_at)}</Text>
            {activity.created_by_name ? (
              <Text style={styles.metaText}>· by {activity.created_by_name}</Text>
            ) : null}
          </View>
        </View>
        <Pressable onPress={onDelete} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
          <Trash2 size={14} color={colors.textMuted} />
        </Pressable>
      </View>
    </Card>
  );
}

function ActivityIcon({ name, color }: { name: string; color: string }) {
  switch (name) {
    case 'phone': return <Phone size={14} color={color} />;
    case 'mail': return <Mail size={14} color={color} />;
    case 'calendar': return <Clock size={14} color={color} />;
    case 'notebook-pen': return <NotebookPen size={14} color={color} />;
    case 'bell': return <Bell size={14} color={color} />;
    case 'arrow-right': return <ArrowRight size={14} color={color} />;
    default: return <Cog size={14} color={color} />;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Follow-up row
// ═══════════════════════════════════════════════════════════════════════

function FollowUpRow({
  followUp,
  onComplete,
  onDelete,
  readOnly = false,
}: {
  followUp: CustomerFollowUp;
  onComplete?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const due = formatDueLabel(followUp.due_at);
  const prio = priorityMeta(followUp.priority);
  const isDone = !!followUp.completed_at;
  return (
    <Card
      accent={isDone ? colors.surface600 : due.overdue ? colors.rose : due.soon ? colors.amber : prio.hex}
      style={{ marginBottom: spacing.sm, opacity: isDone ? 0.65 : 1 }}
    >
      <View style={styles.timelineRow}>
        <Pressable
          onPress={() => !readOnly && onComplete?.()}
          hitSlop={10}
          disabled={readOnly || isDone}
          style={styles.checkWrap}
        >
          {isDone ? (
            <CheckCircle2 size={22} color={colors.emerald} />
          ) : (
            <Circle size={22} color={colors.textSecondary} />
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.timelineTitle, isDone && { textDecorationLine: 'line-through', color: colors.textMuted }]} numberOfLines={2}>
            {followUp.title}
          </Text>
          {followUp.description ? <Text style={styles.timelineBody}>{followUp.description}</Text> : null}
          <View style={styles.timelineMeta}>
            <Text style={[styles.metaText, { color: prio.hex, fontWeight: '600' }]}>{prio.label}</Text>
            <Text style={styles.metaText}>·</Text>
            <Text
              style={[
                styles.metaText,
                due.overdue && !isDone && { color: colors.rose, fontWeight: '600' },
                due.soon && !isDone && { color: colors.amber, fontWeight: '600' },
              ]}
            >
              {isDone ? `Completed ${formatRelativeTime(followUp.completed_at)}` : due.label}
            </Text>
          </View>
        </View>
        {!readOnly && onDelete ? (
          <Pressable onPress={onDelete} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Trash2 size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Info panel
// ═══════════════════════════════════════════════════════════════════════

function InfoPanel({ customer }: { customer: Customer }) {
  const rows: { label: string; value: string | null; icon: React.ReactNode }[] = [
    { label: 'Email', value: customer.email, icon: <Mail size={14} color={colors.sky} /> },
    { label: 'Phone', value: customer.phone, icon: <Phone size={14} color={colors.emerald} /> },
    { label: 'Title', value: customer.title, icon: <User size={14} color={colors.indigo} /> },
    { label: 'Company', value: customer.company_name, icon: <Building2 size={14} color={colors.amber} /> },
    { label: 'Website', value: customer.company_website, icon: <Globe size={14} color={colors.purple} /> },
    { label: 'Industry', value: customer.company_industry, icon: <Tag size={14} color={colors.textSecondary} /> },
    { label: 'Source', value: customer.source ?? customer.referral_source, icon: <ArrowRight size={14} color={colors.textSecondary} /> },
  ];
  return (
    <View>
      <Card style={{ marginBottom: spacing.md }}>
        {rows.map((r, idx) => (
          <View key={r.label} style={[styles.infoRow, idx < rows.length - 1 && styles.infoRowBorder]}>
            {r.icon}
            <Text style={styles.infoLabel}>{r.label}</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{r.value ?? '—'}</Text>
          </View>
        ))}
      </Card>

      {customer.tags.length > 0 ? (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={styles.infoHeader}>Tags</Text>
          <View style={styles.tagRow}>
            {customer.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {customer.internal_notes ? (
        <Card>
          <Text style={styles.infoHeader}>Internal notes</Text>
          <Text style={styles.notesBody}>{customer.internal_notes}</Text>
        </Card>
      ) : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Activity sheet
// ═══════════════════════════════════════════════════════════════════════

function ActivitySheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { type: ActivityType; title: string; description: string }) => void | Promise<void>;
}) {
  const [type, setType] = useState<ActivityType>('note');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType('note');
    setTitle('');
    setDescription('');
  }, [open]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title', 'Every activity needs a headline.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ type, title, description });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Log activity</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetLabel}>Type</Text>
          <View style={styles.optionRow}>
            {ACTIVITY_TYPES.filter((t) => t.key !== 'system' && t.key !== 'status_change').map((t) => {
              const active = type === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    haptics.select();
                    setType(t.key);
                  }}
                  style={[
                    styles.optionPill,
                    active && { borderColor: t.hex, backgroundColor: t.hex + '22' },
                  ]}
                >
                  <ActivityIcon name={t.icon} color={active ? t.hex : colors.textSecondary} />
                  <Text style={[styles.optionText, active && { color: t.hex, fontWeight: '700' }]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Headline</Text>
          <TextInput
            style={styles.sheetInput}
            value={title}
            onChangeText={setTitle}
            placeholder="What happened?"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Notes</Text>
          <TextInput
            style={[styles.sheetInput, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional details, quotes, next steps"
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </ScrollView>
        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="secondary" size="md" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Save" variant="primary" size="md" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Follow-up sheet
// ═══════════════════════════════════════════════════════════════════════

function FollowUpSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    type: FollowUpType;
    title: string;
    description: string;
    due_at: string;
    priority: FollowUpPriority;
  }) => void | Promise<void>;
}) {
  const [type, setType] = useState<FollowUpType>('follow_up');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState<FollowUpPriority>('normal');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType('follow_up');
    setTitle('');
    setDescription('');
    // Default due date = tomorrow
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDueDate(`${yyyy}-${mm}-${dd}`);
    setDueTime('09:00');
    setPriority('normal');
  }, [open]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title', 'Every follow-up needs a title.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(dueTime);
    if (!timeMatch) {
      Alert.alert('Invalid time', 'Use HH:MM (24-hour).');
      return;
    }
    const due = new Date(`${dueDate}T${dueTime}:00`);
    if (isNaN(due.getTime())) {
      Alert.alert('Invalid date/time', 'Could not parse. Check format.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        title,
        description,
        due_at: due.toISOString(),
        priority,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Schedule follow-up</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetLabel}>Type</Text>
          <View style={styles.optionRow}>
            {FOLLOW_UP_TYPES.map((t) => {
              const active = type === t.key;
              const Icon =
                t.icon === 'bell' ? Bell :
                t.icon === 'phone' ? Phone :
                t.icon === 'file-text' ? NotebookPen :
                t.icon === 'heart' ? Heart :
                Monitor;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    haptics.select();
                    setType(t.key);
                  }}
                  style={[
                    styles.optionPill,
                    active && { borderColor: colors.emerald, backgroundColor: colors.emerald + '22' },
                  ]}
                >
                  <Icon size={14} color={active ? colors.emerald : colors.textSecondary} />
                  <Text style={[styles.optionText, active && { color: colors.emerald, fontWeight: '700' }]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Title</Text>
          <TextInput
            style={styles.sheetInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Call back about proposal"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Notes</Text>
          <TextInput
            style={[styles.sheetInput, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional context"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={styles.sheetLabel}>Due date</Text>
          <TextInput
            style={styles.sheetInput}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.sheetLabel}>Due time</Text>
          <TextInput
            style={styles.sheetInput}
            value={dueTime}
            onChangeText={setDueTime}
            placeholder="HH:MM (24h)"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Priority</Text>
          <View style={styles.optionRow}>
            {FOLLOW_UP_PRIORITIES.map((p) => {
              const active = priority === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    haptics.select();
                    setPriority(p.key);
                  }}
                  style={[
                    styles.optionPill,
                    active && { borderColor: p.hex, backgroundColor: p.hex + '22' },
                  ]}
                >
                  <View style={[styles.priorityDot, { backgroundColor: p.hex }]} />
                  <Text style={[styles.optionText, active && { color: p.hex, fontWeight: '700' }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="secondary" size="md" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Schedule" variant="primary" size="md" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Edit customer sheet
// ═══════════════════════════════════════════════════════════════════════

function EditCustomerSheet({
  open,
  customer,
  onClose,
  onSave,
}: {
  open: boolean;
  customer: Customer;
  onClose: () => void;
  onSave: (patch: Partial<Customer>) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [source, setSource] = useState<CustomerSource | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(customer.full_name ?? '');
    setPhone(customer.phone ?? '');
    setTitle(customer.title ?? '');
    setCompanyName(customer.company_name ?? '');
    setCompanyWebsite(customer.company_website ?? '');
    setCompanyIndustry(customer.company_industry ?? '');
    setEstimatedValue(customer.estimated_value ? String(customer.estimated_value) : '');
    setSource(customer.source);
    setTagsText(customer.tags.join(', '));
    setInternalNotes(customer.internal_notes ?? '');
  }, [open, customer]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = tagsText
        .split(/[,\n]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);
      const value = Number(estimatedValue.replace(/[^0-9.]/g, '')) || 0;
      await onSave({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        title: title.trim() || null,
        company_name: companyName.trim() || null,
        company_website: companyWebsite.trim() || null,
        company_industry: companyIndustry.trim() || null,
        estimated_value: value,
        source,
        tags,
        internal_notes: internalNotes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Edit customer</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetLabel}>Full name</Text>
          <TextInput
            style={styles.sheetInput}
            value={fullName}
            onChangeText={setFullName}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Title</Text>
          <TextInput
            style={styles.sheetInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Founder, CEO"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Phone</Text>
          <TextInput
            style={styles.sheetInput}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Company</Text>
          <TextInput
            style={styles.sheetInput}
            value={companyName}
            onChangeText={setCompanyName}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Website</Text>
          <TextInput
            style={styles.sheetInput}
            value={companyWebsite}
            onChangeText={setCompanyWebsite}
            autoCapitalize="none"
            keyboardType="url"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Industry</Text>
          <TextInput
            style={styles.sheetInput}
            value={companyIndustry}
            onChangeText={setCompanyIndustry}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Estimated value ($)</Text>
          <TextInput
            style={styles.sheetInput}
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Source</Text>
          <View style={styles.optionRow}>
            <Pressable
              onPress={() => {
                haptics.select();
                setSource(null);
              }}
              style={[
                styles.optionPill,
                source === null && { borderColor: colors.textSecondary, backgroundColor: colors.surface700 },
              ]}
            >
              <Text style={[styles.optionText, source === null && { color: colors.textPrimary, fontWeight: '700' }]}>
                None
              </Text>
            </Pressable>
            {CUSTOMER_SOURCES.map((s) => {
              const active = source === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => {
                    haptics.select();
                    setSource(s.key);
                  }}
                  style={[
                    styles.optionPill,
                    active && { borderColor: colors.emerald, backgroundColor: colors.emerald + '22' },
                  ]}
                >
                  <Text style={[styles.optionText, active && { color: colors.emerald, fontWeight: '700' }]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Tags (comma-separated)</Text>
          <TextInput
            style={styles.sheetInput}
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="vip, warm-intro"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.sheetLabel}>Internal notes</Text>
          <TextInput
            style={[styles.sheetInput, styles.multiline]}
            value={internalNotes}
            onChangeText={setInternalNotes}
            placeholder="Private notes — visible to admins only"
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </ScrollView>
        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="secondary" size="md" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Save" variant="primary" size="md" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  headerBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },

  // Hero
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  heroName: { ...typography.h1, color: colors.textPrimary },
  heroSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  heroLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  quickActionText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  heroStat: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  heroStatValue: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' },
  heroStatLabel: { ...typography.micro, color: colors.textMuted, marginTop: 2 },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.border,
  },

  // Section labels
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  tempRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tempOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  tempOptionText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 4,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  tabBtnActive: { backgroundColor: colors.surface700 },
  tabText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.textPrimary, fontWeight: '700' },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { ...typography.micro, color: colors.textOnAccent, fontWeight: '700' },

  inlineActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  // Timeline row / Follow-up row shared
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  timelineIcon: {
    width: 34, height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  timelineTitle: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '600' },
  timelineBody: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  timelineMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaText: { ...typography.caption, color: colors.textSecondary },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  checkWrap: { paddingTop: 2 },

  // Info panel
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: { ...typography.caption, color: colors.textSecondary, width: 72 },
  infoValue: { ...typography.body, color: colors.textPrimary, flex: 1 },
  infoHeader: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
  notesBody: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },

  // Sheets
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface900,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 40, height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  sheetTitle: { ...typography.h2, color: colors.textPrimary },
  sheetLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sheetInput: {
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
});
