/**
 * /create/consult — Consulting Discovery wizard (Wave 1b).
 *
 * Locks product_type=consulting and starts the lead in the `intro_call` stage.
 * Four focused steps for capturing a consulting prospect on the phone:
 *   1) Who         — title (required) + contact details
 *   2) Scope       — their pain / goal + deal value / retainer MRR
 *   3) Discovery   — planned call date + source
 *   4) Notes       — anything extra
 *
 * The entered discovery date becomes `next_action_date` with
 * `next_action = "Run discovery call"`, so it surfaces immediately on Home
 * and the Sales rep's dashboard.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WizardShell, WizardStepDef } from '@/components/WizardShell';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/AuthContext';
import { SOURCES, type Source, createLead } from '@/lib/leadsService';
import { colors, spacing, typography } from '@/lib/theme';

const ACCENT = colors.amber;

/** YYYY-MM-DD lead-in for the discovery-call input. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function ConsultingDiscoveryWizard() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [mrr, setMrr] = useState('');
  const [callDate, setCallDate] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const callDateValid = !callDate || DATE_RE.test(callDate);

  const onFinish = useCallback(async () => {
    if (!title.trim() || !source) return;
    if (callDate && !DATE_RE.test(callDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD for the discovery call date.');
      return;
    }
    setSaving(true);
    try {
      await createLead(
        {
          product_type: 'consulting',
          stage: 'intro_call',
          title: title.trim(),
          company_name: company.trim() || null,
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          description: description.trim() || null,
          deal_value: Number(dealValue) || 0,
          mrr: Number(mrr) || 0,
          source,
          next_action: callDate ? 'Run discovery call' : 'Schedule discovery call',
          next_action_date: callDate || null,
          notes: notes.trim() || null,
        },
        user?.id ?? null
      );
      Alert.alert('Discovery opened', `${title.trim()} is queued for discovery.`);
      router.replace('/create');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not open discovery';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }, [
    title,
    company,
    contactName,
    contactEmail,
    contactPhone,
    description,
    dealValue,
    mrr,
    callDate,
    source,
    notes,
    user?.id,
    router,
  ]);

  const steps = useMemo<WizardStepDef[]>(
    () => [
      {
        key: 'who',
        title: 'Who is the prospect?',
        subtitle: 'Consulting always starts with a name and a company.',
        canAdvance: () => title.trim().length > 0,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Lead title *"
              placeholder="e.g., Acme Corp — ops consulting"
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
        key: 'scope',
        title: 'What do they need?',
        subtitle: 'One-line scope, plus a first read on value.',
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Scope / pain point"
              placeholder="What's the problem we're solving?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Input
              label="Project fee (USD, one-time)"
              placeholder="25000"
              value={dealValue}
              onChangeText={setDealValue}
              keyboardType="numeric"
            />
            <Input
              label="Retainer (USD / month)"
              placeholder="3500"
              value={mrr}
              onChangeText={setMrr}
              keyboardType="numeric"
              helper="Leave blank if they only want a one-time engagement."
            />
          </View>
        ),
      },
      {
        key: 'discovery',
        title: 'Discovery call',
        subtitle: 'When and how did this land in front of you?',
        canAdvance: () => !!source && callDateValid,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Planned call date"
              placeholder="YYYY-MM-DD"
              value={callDate}
              onChangeText={setCallDate}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              error={callDateValid ? null : 'Use YYYY-MM-DD'}
              helper="Optional — leave blank if still pending."
            />
            <Text style={styles.sectionLabel}>Source</Text>
            <View style={styles.wrap}>
              {SOURCES.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  selected={source === s.key}
                  accent={ACCENT}
                  onPress={() => setSource(s.key)}
                />
              ))}
            </View>
          </View>
        ),
      },
      {
        key: 'notes',
        title: 'Anything else?',
        subtitle: 'Context for when you pick this up tomorrow.',
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Notes"
              placeholder="Referral context, decision-maker, timing pressures..."
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
      title,
      company,
      contactName,
      contactEmail,
      contactPhone,
      description,
      dealValue,
      mrr,
      callDate,
      callDateValid,
      source,
      notes,
    ]
  );

  return (
    <WizardShell
      steps={steps}
      finishLabel="Open Discovery"
      saving={saving}
      accent={ACCENT}
      onFinish={onFinish}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
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
