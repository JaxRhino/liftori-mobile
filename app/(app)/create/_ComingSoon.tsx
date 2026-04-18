/**
 * _ComingSoon — shared placeholder for wizard routes still in the backlog.
 *
 * Leading underscore keeps expo-router from treating this as a route.
 * Renders a full-screen notice with a Back button, matching the rest of the
 * wizard chrome (SafeScreen + colors + spacing).
 */
import React from 'react';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Button } from '@/components/Button';
import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  title: string;
  subtitle: string;
  body: string;
  icon?: ReactNode;
  accent?: string;
}

export default function ComingSoonWizard({
  title,
  subtitle,
  body,
  icon,
  accent = colors.emerald,
}: Props) {
  const router = useRouter();
  return (
    <SafeScreen bottom="inset" scroll={false}>
      <View style={styles.root}>
        <View style={styles.center}>
          {icon ? (
            <View
              style={[styles.iconBadge, { backgroundColor: withAlpha(accent, 0.14) }]}
            >
              {icon}
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>

        <Button
          label="Back"
          variant="secondary"
          onPress={() => router.back()}
          icon={<ChevronLeft size={18} color={colors.textPrimary} />}
          fullWidth
        />
      </View>
    </SafeScreen>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },
});
