/**
 * Create tab — the flagship "quick capture" entry point.
 *
 * Wave 0 stub: a splash of the four wizard paths that will live behind the +.
 * Wave 1 will wire each tile to its own wizard route:
 *   • /create/lead        — CRM quick add
 *   • /create/consult     — Consulting discovery
 *   • /create/custom      — Custom build brief
 *   • /create/appointment — Book a call
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ClipboardList, HandCoins, Hammer, PhoneCall } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Path = {
  key: string;
  title: string;
  description: string;
  accent: string;
  icon: React.ReactNode;
};

const PATHS: Path[] = [
  {
    key: 'lead',
    title: 'New Lead',
    description: 'Capture an inbound lead or prospect on the fly.',
    accent: colors.emerald,
    icon: <ClipboardList size={22} color={colors.emerald} />,
  },
  {
    key: 'consult',
    title: 'Consulting Discovery',
    description: 'Book a discovery call and open a consulting engagement.',
    accent: colors.sky,
    icon: <HandCoins size={22} color={colors.sky} />,
  },
  {
    key: 'custom',
    title: 'Custom Build Brief',
    description: 'Start a custom build brief from the field.',
    accent: colors.purple,
    icon: <Hammer size={22} color={colors.purple} />,
  },
  {
    key: 'appt',
    title: 'Book an Appointment',
    description: 'Schedule an internal or client meeting.',
    accent: colors.amber,
    icon: <PhoneCall size={22} color={colors.amber} />,
  },
];

export default function CreateScreen() {
  return (
    <SafeScreen bottom="skip" scroll>
      <Header
        title="Create"
        subtitle="Capture anything in under a minute."
        centerTitle
      />
      <View style={styles.body}>
        {PATHS.map((p) => (
          <Card
            key={p.key}
            variant="elevated"
            accent={p.accent}
            onPress={() => {
              haptics.bump();
              // Wave 1: router.push(`/create/${p.key}`)
            }}
            style={styles.card}
          >
            <View style={styles.cardRow}>
              <View style={[styles.iconBadge, { backgroundColor: withAlpha(p.accent, 0.14) }]}>
                {p.icon}
              </View>
              <View style={styles.cardText}>
                <Text style={styles.title}>{p.title}</Text>
                <Text style={styles.description}>{p.description}</Text>
              </View>
            </View>
          </Card>
        ))}

        <Text style={styles.hint}>Wizards land in Wave 1.</Text>
      </View>
    </SafeScreen>
  );
}

/** Convert a hex color to an rgba string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    padding: 0,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  hint: {
    textAlign: 'center',
    marginTop: spacing.xl,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
