/**
 * Customers — CRM index screen.
 *
 * Mirrors the Customers page from the web admin (liftori-admin/src/pages/Customers.jsx).
 * Two view modes:
 *   • List view — filter chips for stage + temperature, search, scrollable customer cards
 *   • Pipeline view — Kanban columns across the 8 CRM stages
 *
 * Tapping a customer row navigates to `/customer/[id]`. The + in the header
 * opens a "new customer" sheet.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useRouter } from 'expo-router';
import {
  Users,
  Plus,
  Search,
  X,
  Flame,
  Thermometer,
  Snowflake,
  Building2,
  DollarSign,
  LayoutList,
  Columns3,
  ChevronRight,
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
  CustomerUpdateInput,
  Temperature,
  TEMPERATURES,
  displayName,
  formatEstimatedValue,
  formatRelativeTime,
  groupByStage,
  listCustomers,
  stageMeta,
  summarize,
  temperatureMeta,
  updateCustomer,
} from '@/lib/customersService';
import { supabase } from '@/lib/supabase';

type ViewMode = 'list' | 'pipeline';

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<CrmStage | 'all'>('all');
  const [temperature, setTemperature] = useState<Temperature | 'all'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const rows = await listCustomers({ limit: 500 });
      setCustomers(rows);
    } catch (e: any) {
      console.warn('[customers] list failed', e);
      Alert.alert('Could not load customers', e?.message ?? '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (stage !== 'all' && c.crm_stage !== stage) return false;
      if (temperature !== 'all' && c.lead_temperature !== temperature) return false;
      if (!q) return true;
      const hay = `${c.full_name ?? ''} ${c.email ?? ''} ${c.company_name ?? ''} ${c.phone ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search, stage, temperature]);

  const summary = useMemo(() => summarize(customers), [customers]);

  const openDetail = (c: Customer) => {
    haptics.tap();
    router.push(`/customer/${c.id}` as any);
  };

  const handleCreate = async (payload: { email: string; full_name: string; company_name?: string; phone?: string }) => {
    try {
      // Create an auth-less profile row. Normally customers come in via auth signup,
      // but for manual CRM entry we insert directly with a generated UUID.
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          email: payload.email.trim().toLowerCase(),
          full_name: payload.full_name.trim() || null,
          company_name: payload.company_name?.trim() || null,
          phone: payload.phone?.trim() || null,
          role: 'customer',
          crm_stage: 'prospect',
          lead_temperature: 'cold',
        })
        .select()
        .single();
      if (error) throw error;
      setSheetOpen(false);
      await fetchAll();
      if (data?.id) router.push(`/customer/${data.id}` as any);
    } catch (e: any) {
      Alert.alert('Could not create customer', e?.message ?? 'Please try again.');
    }
  };

  return (
    <SafeScreen>
      <Header
        title="Customers"
        subtitle={`${summary.total} total · ${formatEstimatedValue(summary.pipelineValue)} pipeline`}
        onBack={() => router.back()}
        trailing={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Pressable
              onPress={() => {
                haptics.select();
                setView(view === 'list' ? 'pipeline' : 'list');
              }}
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
              accessibilityLabel="Toggle view"
            >
              {view === 'list' ? (
                <Columns3 size={20} color={colors.textPrimary} />
              ) : (
                <LayoutList size={20} color={colors.textPrimary} />
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                haptics.bump();
                setSheetOpen(true);
              }}
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
              accessibilityLabel="New customer"
            >
              <Plus size={22} color={colors.emerald} />
            </Pressable>
          </View>
        }
      />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.emerald} />
        </View>
      ) : (
        <>
          {/* Search */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, company, email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={10}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Summary pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRow}
          >
            <SummaryPill icon={<Users size={14} color={colors.sky} />} label="Total" value={String(summary.total)} />
            <SummaryPill icon={<Flame size={14} color={colors.rose} />} label="Hot" value={String(summary.hot)} />
            <SummaryPill icon={<Thermometer size={14} color={colors.amber} />} label="Warm" value={String(summary.warm)} />
            <SummaryPill icon={<Snowflake size={14} color={colors.sky} />} label="Cold" value={String(summary.cold)} />
            <SummaryPill icon={<DollarSign size={14} color={colors.emerald} />} label="Pipeline" value={formatEstimatedValue(summary.pipelineValue)} />
          </ScrollView>

          {/* Stage chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <FilterChip label="All stages" active={stage === 'all'} onPress={() => setStage('all')} accent={colors.textPrimary} />
            {CRM_STAGES.map((s) => (
              <FilterChip
                key={s.key}
                label={`${s.label} · ${summary.byStage[s.key] ?? 0}`}
                active={stage === s.key}
                onPress={() => setStage(s.key)}
                accent={s.hex}
              />
            ))}
          </ScrollView>

          {/* Temperature chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filterRow, { paddingBottom: spacing.sm }]}
          >
            <FilterChip label="Any temp" active={temperature === 'all'} onPress={() => setTemperature('all')} accent={colors.textPrimary} />
            {TEMPERATURES.map((t) => (
              <FilterChip
                key={t.key}
                label={t.label}
                active={temperature === t.key}
                onPress={() => setTemperature(t.key)}
                accent={t.hex}
              />
            ))}
          </ScrollView>

          {view === 'list' ? (
            <ScrollView
              contentContainerStyle={styles.body}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    fetchAll();
                  }}
                  tintColor={colors.emerald}
                />
              }
            >
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Users size={28} color={colors.textSecondary} />}
                  title="No customers yet"
                  description="New customers will appear here. Tap + to add one manually."
                />
              ) : (
                filtered.map((c) => <CustomerRow key={c.id} customer={c} onPress={() => openDetail(c)} />)
              )}
            </ScrollView>
          ) : (
            <PipelineView
              customers={filtered}
              onCardPress={openDetail}
              onRefresh={() => {
                setRefreshing(true);
                fetchAll();
              }}
              refreshing={refreshing}
            />
          )}
        </>
      )}

      <NewCustomerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreate={handleCreate}
      />
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Customer row
// ═══════════════════════════════════════════════════════════════════════

function CustomerRow({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const stage = stageMeta(customer.crm_stage);
  const temp = temperatureMeta(customer.lead_temperature);
  return (
    <Card onPress={onPress} accent={stage.hex} style={{ marginBottom: spacing.sm }}>
      <View style={styles.rowTop}>
        <Avatar name={displayName(customer)} url={customer.avatar_url} size="md" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {displayName(customer)}
          </Text>
          {customer.company_name ? (
            <View style={styles.rowCompanyLine}>
              <Building2 size={12} color={colors.textSecondary} />
              <Text style={styles.rowCompany} numberOfLines={1}>
                {customer.company_name}
              </Text>
            </View>
          ) : (
            <Text style={styles.rowCompany} numberOfLines={1}>
              {customer.email}
            </Text>
          )}
        </View>
        <TempBadge temp={customer.lead_temperature} />
        <ChevronRight size={18} color={colors.textMuted} />
      </View>

      <View style={styles.rowMeta}>
        <View style={[styles.pill, { borderColor: stage.hex, backgroundColor: stage.hex + '22' }]}>
          <Text style={[styles.pillText, { color: stage.hex }]}>{stage.label}</Text>
        </View>
        {customer.estimated_value ? (
          <View style={styles.metaBlock}>
            <DollarSign size={11} color={colors.emerald} />
            <Text style={styles.metaText}>{formatEstimatedValue(customer.estimated_value)}</Text>
          </View>
        ) : null}
        {customer.last_activity_at ? (
          <Text style={styles.metaText}>· {formatRelativeTime(customer.last_activity_at)}</Text>
        ) : null}
      </View>
    </Card>
  );
}

function TempBadge({ temp }: { temp: Temperature }) {
  const meta = temperatureMeta(temp);
  const Icon = meta.icon === 'flame' ? Flame : meta.icon === 'thermometer' ? Thermometer : Snowflake;
  return (
    <View style={[styles.tempBadge, { backgroundColor: meta.hex + '22', borderColor: meta.hex }]}>
      <Icon size={11} color={meta.hex} />
      <Text style={[styles.tempText, { color: meta.hex }]}>{meta.label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pipeline (Kanban) view
// ═══════════════════════════════════════════════════════════════════════

interface PipelineProps {
  customers: Customer[];
  onCardPress: (c: Customer) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

function PipelineView({ customers, onCardPress, onRefresh, refreshing }: PipelineProps) {
  const groups = useMemo(() => groupByStage(customers), [customers]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pipelineRow}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
      }
    >
      {CRM_STAGES.map((s) => {
        const rows = groups[s.key] || [];
        const value = rows.reduce((acc, r) => acc + (r.estimated_value || 0), 0);
        return (
          <View key={s.key} style={styles.pipelineCol}>
            <View style={[styles.pipelineColHeader, { borderTopColor: s.hex }]}>
              <Text style={[styles.pipelineColTitle, { color: s.hex }]}>{s.label}</Text>
              <Text style={styles.pipelineColMeta}>
                {rows.length} · {formatEstimatedValue(value)}
              </Text>
            </View>
            <ScrollView style={styles.pipelineColScroll}>
              {rows.length === 0 ? (
                <Text style={styles.pipelineEmpty}>No customers</Text>
              ) : (
                rows.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => onCardPress(c)}
                    style={({ pressed }) => [styles.pipelineCard, pressed && styles.pressed]}
                  >
                    <Text style={styles.pipelineCardName} numberOfLines={1}>
                      {displayName(c)}
                    </Text>
                    {c.company_name ? (
                      <Text style={styles.pipelineCardSub} numberOfLines={1}>
                        {c.company_name}
                      </Text>
                    ) : null}
                    <View style={styles.pipelineCardFooter}>
                      <TempBadge temp={c.lead_temperature} />
                      {c.estimated_value ? (
                        <Text style={styles.pipelineValue}>
                          {formatEstimatedValue(c.estimated_value)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Filter chip + Summary pill
// ═══════════════════════════════════════════════════════════════════════

function FilterChip({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[
        styles.chip,
        active && { backgroundColor: accent + '22', borderColor: accent },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          active && { color: accent, fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryPill}>
      {icon}
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// New customer sheet
// ═══════════════════════════════════════════════════════════════════════

function NewCustomerSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: { email: string; full_name: string; company_name?: string; phone?: string }) => void | Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setFullName('');
    setCompanyName('');
    setPhone('');
  }, [open]);

  const handleSave = async () => {
    if (!email.trim()) {
      Alert.alert('Email required', 'Every customer needs an email.');
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        email,
        full_name: fullName,
        company_name: companyName,
        phone,
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
          <Text style={styles.sheetTitle}>New customer</Text>
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
            placeholder="Vanessa Martinez"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Email *</Text>
          <TextInput
            style={styles.sheetInput}
            value={email}
            onChangeText={setEmail}
            placeholder="customer@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.sheetLabel}>Company</Text>
          <TextInput
            style={styles.sheetInput}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="VJ Thrift Finds"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Phone</Text>
          <TextInput
            style={styles.sheetInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />
        </ScrollView>
        <View style={styles.sheetActions}>
          <Button label="Cancel" variant="secondary" size="md" onPress={onClose} style={{ flex: 1 }} />
          <Button label="Create" variant="primary" size="md" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
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

  // Search
  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
  },

  // Stats
  statsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  summaryPill: {
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
  summaryValue: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  summaryLabel: { ...typography.caption, color: colors.textSecondary },

  // Filter chip row
  filterRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Row
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rowCompanyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  rowCompany: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  pillText: {
    ...typography.micro,
    fontWeight: '700',
  },
  metaBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tempBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  tempText: {
    ...typography.micro,
    fontWeight: '700',
  },

  // Pipeline
  pipelineRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pipelineCol: {
    width: 260,
    backgroundColor: colors.surface900,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  pipelineColHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 3,
    gap: 2,
  },
  pipelineColTitle: { ...typography.h3 },
  pipelineColMeta: { ...typography.caption, color: colors.textSecondary },
  pipelineColScroll: { maxHeight: '100%', paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  pipelineEmpty: { ...typography.caption, color: colors.textMuted, textAlign: 'center', padding: spacing.lg },
  pipelineCard: {
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: 2,
  },
  pipelineCardName: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' },
  pipelineCardSub: { ...typography.caption, color: colors.textSecondary },
  pipelineCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  pipelineValue: { ...typography.caption, color: colors.emerald, fontWeight: '700' },

  // Sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
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
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
});
