/**
 * /create/appointment — Book an Appointment wizard (Wave 1d).
 *
 * Rep-facing equivalent of the public liftori.ai/book flow. Writes directly
 * to `consulting_appointments` with status='scheduled' and a freshly minted
 * room_id so the admin calendar / Sales Call Hub picks it up exactly like a
 * self-served booking.
 *
 * Four steps:
 *   1) Who      — name (required) + contact details
 *   2) When     — date + start + duration (chip) → end is computed
 *   3) Scope    — primary_interest (required) + biggest_challenge
 *   4) Context  — company details + how_heard
 *
 * No slot_id / consultant_id assignment here — leaving both null lets the
 * consulting coordinator pick up the appointment and route it. A future
 * wave can add a consultant-picker step for direct assignment.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Timer } from 'lucide-react-native';
import { WizardShell, WizardStepDef } from '@/components/WizardShell';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import {
  PRIMARY_INTERESTS,
  COMPANY_SIZES,
  HOW_HEARD_OPTIONS,
  DURATION_OPTIONS,
  type PrimaryInterest,
  createAppointment,
  addMinutesToTime,
} from '@/lib/appointmentsService';
import { colors, spacing, typography } from '@/lib/theme';

const ACCENT = colors.amber;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default function AppointmentWizard() {
  const router = useRouter();

  // Step 1 — Who
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');

  // Step 2 — When
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState<number>(30);

  // Step 3 — Scope
  const [primaryInterest, setPrimaryInterest] = useState<PrimaryInterest | null>(null);
  const [biggestChallenge, setBiggestChallenge] = useState('');

  // Step 4 — Context
  const [companyName, setCompanyName] = useState('');
  const [companySize, setCompanySize] = useState<string | null>(null);
  const [industry, setIndustry] = useState('');
  const [howHeard, setHowHeard] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const dateValid = DATE_RE.test(date);
  const timeValid = TIME_RE.test(startTime);

  const onFinish = useCallback(async () => {
    if (!leadName.trim() || !primaryInterest) return;
    if (!dateValid || !timeValid) {
      Alert.alert('Check date/time', 'Use YYYY-MM-DD and HH:MM (24h).');
      return;
    }
    setSaving(true);
    try {
      const end = addMinutesToTime(startTime, duration);
      await createAppointment({
        lead_name: leadName.trim(),
        lead_email: leadEmail.trim() || null,
        lead_phone: leadPhone.trim() || null,
        company_name: companyName.trim() || null,
        company_size: companySize,
        industry: industry.trim() || null,
        primary_interest: primaryInterest,
        biggest_challenge: biggestChallenge.trim() || null,
        how_heard: howHeard,
        appointment_date: date,
        appointment_start: startTime,
        appointment_end: end,
      });
      Alert.alert('Appointment booked', `${leadName.trim()} on ${date} at ${startTime}.`);
      router.replace('/create');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not book appointment';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }, [
    leadName,
    leadEmail,
    leadPhone,
    companyName,
    companySize,
    industry,
    primaryInterest,
    biggestChallenge,
    howHeard,
    date,
    startTime,
    duration,
    dateValid,
    timeValid,
    router,
  ]);

  const steps = useMemo<WizardStepDef[]>(
    () => [
      {
        key: 'who',
        title: 'Who is it for?',
        subtitle: 'Name is all we need here. Add contact if you have it.',
        canAdvance: () => leadName.trim().length > 0,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Lead name *"
              placeholder="Jane Doe"
              value={leadName}
              onChangeText={setLeadName}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <Input
              label="Lead email"
              placeholder="jane@acme.com"
              value={leadEmail}
              onChangeText={setLeadEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              helper="We email the join link here when set."
            />
            <Input
              label="Lead phone"
              placeholder="(555) 555-5555"
              value={leadPhone}
              onChangeText={setLeadPhone}
              keyboardType="phone-pad"
            />
          </View>
        ),
      },
      {
        key: 'when',
        title: 'When is the call?',
        subtitle: 'Date, start time, and duration. End is computed.',
        canAdvance: () => dateValid && timeValid,
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Date *"
              placeholder="YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              error={!date || dateValid ? null : 'Use YYYY-MM-DD'}
            />
            <Input
              label="Start time *"
              placeholder="14:30"
              value={startTime}
              onChangeText={setStartTime}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              error={!startTime || timeValid ? null : 'Use HH:MM (24h)'}
              helper="24h clock — e.g. 09:00 for 9am, 14:30 for 2:30pm."
            />
            <Text style={styles.sectionLabel}>Duration</Text>
            <View style={styles.wrap}>
              {DURATION_OPTIONS.map((d) => (
                <Chip
                  key={d.key}
                  label={d.label}
                  selected={duration === d.key}
                  accent={ACCENT}
                  icon={<Timer size={14} color={ACCENT} />}
                  onPress={() => setDuration(d.key)}
                />
              ))}
            </View>
            {dateValid && timeValid ? (
              <Text style={styles.endHint}>
                Ends at {addMinutesToTime(startTime, duration).slice(0, 5)}.
              </Text>
            ) : null}
          </View>
        ),
      },
      {
        key: 'scope',
        title: 'What do they want?',
        subtitle: 'Pick the closest match. Add a challenge in their words.',
        canAdvance: () => !!primaryInterest,
        render: () => (
          <View style={styles.stack}>
            <Text style={styles.sectionLabel}>Primary interest *</Text>
            <View style={styles.interestStack}>
              {PRIMARY_INTERESTS.map((p) => (
                <Chip
                  key={p.key}
                  label={`${p.label} — ${p.hint}`}
                  selected={primaryInterest === p.key}
                  accent={ACCENT}
                  size="lg"
                  onPress={() => setPrimaryInterest(p.key)}
                  style={styles.interestChip}
                />
              ))}
            </View>
            <Input
              label="Biggest challenge"
              placeholder="In their own words — what's breaking?"
              value={biggestChallenge}
              onChangeText={setBiggestChallenge}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              helper="Quoted on the internal call briefing."
            />
          </View>
        ),
      },
      {
        key: 'context',
        title: 'Company & source',
        subtitle: 'Optional — useful for triage and reporting.',
        render: () => (
          <View style={styles.stack}>
            <Input
              label="Company"
              placeholder="Acme Corp"
              value={companyName}
              onChangeText={setCompanyName}
              autoCapitalize="words"
            />
            <Text style={styles.sectionLabel}>Company size</Text>
            <View style={styles.wrap}>
              {COMPANY_SIZES.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  selected={companySize === s.key}
                  accent={ACCENT}
                  onPress={() => setCompanySize(companySize === s.key ? null : s.key)}
                />
              ))}
            </View>
            <Input
              label="Industry"
              placeholder="SaaS / construction / retail..."
              value={industry}
              onChangeText={setIndustry}
              autoCapitalize="words"
            />
            <Text style={styles.sectionLabel}>How did they hear about us?</Text>
            <View style={styles.wrap}>
              {HOW_HEARD_OPTIONS.map((h) => (
                <Chip
                  key={h.key}
                  label={h.label}
                  selected={howHeard === h.key}
                  accent={ACCENT}
                  onPress={() => setHowHeard(howHeard === h.key ? null : h.key)}
                />
              ))}
            </View>
          </View>
        ),
      },
    ],
    [
      leadName,
      leadEmail,
      leadPhone,
      date,
      startTime,
      duration,
      dateValid,
      timeValid,
      primaryInterest,
      biggestChallenge,
      companyName,
      companySize,
      industry,
      howHeard,
    ]
  );

  return (
    <WizardShell
      steps={steps}
      finishLabel="Book Call"
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  interestStack: {
    gap: spacing.sm,
  },
  interestChip: {
    alignSelf: 'stretch',
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  endHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
