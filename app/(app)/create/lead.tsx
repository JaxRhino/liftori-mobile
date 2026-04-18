/**
 * /create/lead — the flagship mobile quick-capture wizard.
 *
 * Four steps:
 *   1) Product        — labos / consulting / custom_build
 *   2) Who            — title (required), company, contact fields
 *   3) Source + value — source chip, one-time value, MRR (per-product)
 *   4) Notes          — free-form
 *
 * On finish: writes to `sales_leads` via `createLead()` and returns the user
 * to the Create hub with a success confirmation. Errors show inline.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Briefcase, Code, Cpu } from 'lucide-react-native';
import { WizardShell, WizardStepDef } from '@/components/WizardShell';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/AuthContext';
import {
  PRODUCTS,
  PRODUCT_KEYS,
  SOURCES,
  type ProductKey,
  type Source,
  createLead,
} from '@/lib/leadsService';
import { colors, spacing, typography } from '@/lib/theme';

// Map product color tokens to theme hex values.
const PRODUCT_ACCENT: Record<ProductKey, string> = {
  labos: colors.sky,
  consulting: colors.amber,
  custom_build: colors.purple,
};

const PRODUCT_ICON: Record<ProductKey, React.ReactNode> = {
  labos: <Cpu size={16} color={colors.sky} />,
  consulting: <Briefcase size={16} color={colors.amber} />,
  custom_build: <Code size={16} color={colors.purple} />,
};

export default function LeadWizard() {
  const router = useRouter();
  const { user } = useAuth();

  // ── Form state ────────────────────────────────────────────────
  const [product, setProduct] = useState<ProductKey | null>(null);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [dealValue, setDealValue] = useState('');
  const [mrr, setMrr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const accent = product ? PRODUCT_ACCENT[product] : colors.emerald;
  const productMeta = product ? PRODUCTS[product] : null;

  // ── Submit ────────────────────────────────────────────────────
  const onFinish = useCallback(async () => {
    if (!product || !title.trim() || !source) return;
    setSaving(true);
    try {
      await createLead(
        {
          product_type: product,
          title: title.trim(),
          company_name: company.trim() || null,
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          deal_value: Number(dealValue) || 0,
          mrr: Number(mrr) || 0,
          source,
          notes: notes.trim() || null,
        },
        user?.id ?? null
      );
      Alert.alert('Lead saved', `${title.trim()} is now in your pipeline.`);
      router.replace('/create');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save lead';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }, [
    product,
    title,
    company,
    contactName,
    contactEmail,
    contactPhone,
    source,
    dealValue,
    mrr,
    notes,
    user?.id,
    router,
  ]);

  // ── Steps ─────────────────────────────────────────────────────
  const steps = useMemo<WizardStepDef[]>(
    () => [
      {
        key: 'product',
        title: 'Which product?',
        subtitle: 'Pick the offer this lead is for.',
        canAdvance: () => !!product,
        render: () => (
          <View style={styles.stack}>
            {PRODUCT_KEYS.map((pk) => {
              const meta = PRODUCTS[pk];
              return (
                <Chip
                  key={pk}
                  label={`${meta.label} — ${meta.description}`}
                  selected={product === pk}
                  accent={PRODUCT_ACCENT[pk]}
                  icon={PRODUCT_ICON[pk]}
                  size="lg"
                  onPress={() => setProduct(pk)}
                  style={styles.productChip}
                />
              );
            })}
          </View>
        ),
      },
      {
        key: 'who',
        title: 'Who is it?',
        subtitle: 'Give the lead a name. Contact details are optional.',
        canAdvance: () => title.trim().length > 0,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Lead title *"
              placeholder="e.g., Acme Corp — website rebuild"
              value={title}
              onChangeText={setTitle}
              autoCapitalize="sentences"
              returnKeyType="next"
            />
            <Input
              label="Company"
              placeholder="Acme Corp"
              value={company}
              onChangeText={setCompany}
              autoCapitalize="words"
            />
            <Input
              label="Contact name"
              placeholder="Jane Doe"
              value={contactName}
              onChangeText={setContactName}
              autoCapitalize="words"
            />
            <Input
              label="Contact email"
              placeholder="jane@acme.com"
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Input
              label="Contact phone"
              placeholder="(555) 555-5555"
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
            />
          </View>
        ),
      },
      {
        key: 'source',
        title: 'Where did it come from?',
        subtitle: 'Source is required. Values are optional.',
        canAdvance: () => !!source,
        render: () => (
          <View style={styles.stack}>
            <Text style={styles.sectionLabel}>Source</Text>
            <View style={styles.wrap}>
              {SOURCES.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  selected={source === s.key}
                  accent={accent}
                  onPress={() => setSource(s.key)}
                />
              ))}
            </View>

            {productMeta?.hasOneTime ? (
              <Input
                label="Deal value (USD, one-time)"
                placeholder="15000"
                value={dealValue}
                onChangeText={setDealValue}
                keyboardType="numeric"
              />
            ) : null}

            {productMeta?.hasMRR ? (
              <Input
                label="MRR (USD / month)"
                placeholder="500"
                value={mrr}
                onChangeText={setMrr}
                keyboardType="numeric"
              />
            ) : null}
          </View>
        ),
      },
      {
        key: 'notes',
        title: 'Anything to remember?',
        subtitle: 'Context for the next time you pick this up.',
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Notes"
              placeholder="How you met them, what they need, budget signals..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        ),
      },
    ],
    [
      product,
      title,
      company,
      contactName,
      contactEmail,
      contactPhone,
      source,
      dealValue,
      mrr,
      notes,
      accent,
      productMeta?.hasMRR,
      productMeta?.hasOneTime,
    ]
  );

  return (
    <WizardShell
      steps={steps}
      finishLabel="Save Lead"
      saving={saving}
      accent={accent}
      onFinish={onFinish}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  productChip: {
    alignSelf: 'stretch',
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
