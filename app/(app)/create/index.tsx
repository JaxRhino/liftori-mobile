/**
 * /create — the flagship "quick capture" entry point.
 *
 * Shows four wizard paths. Tapping a tile pushes the matching wizard onto
 * the create stack.
 *
 *   • /create/lead        — CRM quick add (Wave 1a — LIVE)
 *   • /create/consult     — Consulting discovery (Wave 1b — stub)
 *   • /create/custom      — Custom build brief  (Wave 1c — stub)
 *   • /create/appointment — Book a call         (Wave 1d — stub)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClipboardList, HandCoins, Hammer, PhoneCall } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Path = {
  key: 'lead' | 'consult' | 'custom' | 'appointment';
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
    key: 'appointment',
    title: 'Book an Appointment',
    description: 'Schedule an internal or client meeting.',
    accent: colors.amber,
    icon: <PhoneCall size={22} color={colors.amber} />,
  },
];

export default function CreateIndex() {
  const router = useRouter();
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
              router.push(`/create/${p.key}` as any);
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
});
