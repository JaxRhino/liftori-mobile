/**
 * EmptyState — consistent "nothing here yet" presentation across every list/page.
 *
 * Accepts an icon slot (pass a lucide icon), a title, an optional description,
 * and an optional action Button.
 */
import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '@/lib/theme';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  compact: {
    paddingVertical: spacing.xl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
    lineHeight: 22,
  },
  action: {
    marginTop: spacing.xl,
  },
});
