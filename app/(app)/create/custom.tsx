/**
 * /create/custom — Custom Build Brief wizard (Wave 1c).
 *
 * Locks product_type=custom_build and drops the lead into the `discovery`
 * stage. Four steps:
 *   1) Who    — title + contact details
 *   2) Brief  — one-liner + full brief description
 *   3) Tier   — Starter / Growth / Scale + budget + optional retainer
 *   4) Source / notes
 *
 * Tier selection is free from price constraints here — it's a label the
 * salesperson applies. The deal value is whatever Ryan or the rep types.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sprout, Rocket, Mountain } from 'lucide-react-native';
import { WizardShell, WizardStepDef } from '@/components/WizardShell';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/AuthContext';
import { SOURCES, type Source, createLead } from '@/lib/leadsService';
import { colors, spacing, typography } from '@/lib/theme';

const ACCENT = colors.purple;

type Tier = 'Starter' | 'Growth' | 'Scale';

const TIERS: {
  key: Tier;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'Starter',
    label: 'Starter',
    hint: 'From $2.5K — landing / MVP slice',
    icon: <Sprout size={16} color={ACCENT} />,
  },
  {
    key: 'Growth',
    label: 'Growth',
    hint: 'From $8K + managed services',
    icon: <Rocket size={16} color={ACCENT} />,
  },
  {
    key: 'Scale',
    label: 'Scale',
    hint: 'From $20K + $2–5K/mo',
    icon: <Mountain size={16} color={ACCENT} />,
  },
];

export default function CustomBuildBriefWizard() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [oneLiner, setOneLiner] = useState('');
  const [brief, setBrief] = useState('');
  const [tier, setTier] = useState<Tier | null>(null);
  const [dealValue, setDealValue] = useState('');
  const [mrr, setMrr] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const onFinish = useCallback(async () => {
    if (!title.trim() || !tier || !source || !oneLiner.trim()) return;
    setSaving(true);
    try {
      // Stuff the one-liner on the first line of the description so it's
      // scannable in the pipeline, with the full brief below it.
      const descBody = [oneLiner.trim(), brief.trim()].filter(Boolean).join('\n\n');
      await createLead(
        {
          product_type: 'custom_build',
          stage: 'discovery',
          title: title.trim(),
          company_name: company.trim() || null,
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          description: descBody || null,
          deal_value: Number(dealValue) || 0,
          mrr: Number(mrr) || 0,
          source,
          notes: notes.trim() || null,
          tags: [`tier:${tier}`],
        },
        user?.id ?? null
      );
      Alert.alert('Brief saved', `${title.trim()} is in discovery.`);
      router.replace('/create');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save brief';
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
    oneLiner,
    brief,
    tier,
    dealValue,
    mrr,
    source,
    notes,
    user?.id,
    router,
  ]);

  const steps = useMemo<WizardStepDef[]>(
    () => [
      {
        key: 'who',
        title: 'Who is the brief for?',
        subtitle: 'Give it a name and a point of contact.',
        canAdvance: () => title.trim().length > 0,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Lead title *"
              placeholder="e.g., Acme — internal ops portal"
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
        key: 'brief',
        title: 'What are we building?',
        subtitle: 'One line they can repeat. Full brief below.',
        canAdvance: () => oneLiner.trim().length > 0,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="One-liner *"
              placeholder="Build X that does Y for Z"
              value={oneLiner}
              onChangeText={setOneLiner}
              autoCapitalize="sentences"
              maxLength={140}
              helper={`${oneLiner.length}/140 — keep it tight.`}
            />
            <Input
              label="Full brief"
              placeholder="Who's it for? What does it do? What's out of scope?"
              value={brief}
              onChangeText={setBrief}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        ),
      },
      {
        key: 'tier',
        title: 'Which tier fits?',
        subtitle: 'Rough sizing. Values are optional.',
        canAdvance: () => !!tier,
        render: () => (
          <View style={styles.stack}>
            {TIERS.map((t) => (
              <Chip
                key={t.key}
                label={`${t.label} — ${t.hint}`}
                selected={tier === t.key}
                accent={ACCENT}
                icon={t.icon}
                size="lg"
                onPress={() => setTier(t.key)}
                style={styles.tierChip}
              />
            ))}
            <Input
              label="Expected project fee (USD, one-time)"
              placeholder="15000"
              value={dealValue}
              onChangeText={setDealValue}
              keyboardType="numeric"
            />
            <Input
              label="Managed services (USD / month)"
              placeholder="500"
              value={mrr}
              onChangeText={setMrr}
              keyboardType="numeric"
              helper="Leave blank if the project is one-time only."
            />
          </View>
        ),
      },
      {
        key: 'source',
        title: 'Source & notes',
        subtitle: 'Where the lead came from + anything extra.',
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
                  accent={ACCENT}
                  onPress={() => setSource(s.key)}
                />
              ))}
            </View>
            <Input
              label="Notes"
              placeholder="Gotchas, budget signals, timing, stakeholders..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={5}
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
      oneLiner,
      brief,
      tier,
      dealValue,
      mrr,
      source,
      notes,
    ]
  );

  return (
    <WizardShell
      steps={steps}
      finishLabel="Save Brief"
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
  tierChip: {
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
