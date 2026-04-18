/**
 * Chip — tappable pill used for source/product selection and filter rows.
 *
 * Two states: default and selected. Selected state flips the fill to the
 * chip's accent color and adds a subtle border glow. Haptic on press.
 */
import React, { ReactNode, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  /** Override accent color when selected. Defaults to emerald. */
  accent?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  accent = colors.emerald,
  disabled = false,
  size = 'md',
  style,
  testID,
}: ChipProps) {
  const handlePress = useCallback(() => {
    if (disabled) return;
    haptics.select();
    onPress?.();
  }, [disabled, onPress]);

  const s = sizeStyles[size];

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          paddingHorizontal: s.paddingX,
          paddingVertical: s.paddingY,
          borderRadius: radii.pill,
        },
        !selected && styles.unselected,
        selected && { backgroundColor: withAlpha(accent, 0.18), borderColor: accent },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text
          style={[
            styles.label,
            { fontSize: s.fontSize },
            selected ? { color: accent } : { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const sizeStyles = {
  sm: { paddingX: spacing.md, paddingY: spacing.xs, fontSize: 12 },
  md: { paddingX: spacing.lg, paddingY: spacing.sm, fontSize: 13 },
  lg: { paddingX: spacing.xl, paddingY: spacing.md, fontSize: 14 },
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  unselected: {
    backgroundColor: colors.surface800,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
});
