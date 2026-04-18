/**
 * Button — primary interactive primitive.
 *
 * Variants:
 *   • primary    — emerald, for CTAs
 *   • secondary  — surface, for secondary actions
 *   • ghost      — transparent, for tertiary
 *   • destructive — rose, for delete/cancel
 *   • outline    — bordered transparent
 *
 * Sizes: sm / md / lg.
 *
 * Always plays a haptic on press (variant-appropriate) and animates a subtle
 * scale on press-in. Respects `loading` (spinner + disabled) and `disabled`.
 */
import React, { ReactNode, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label?: string;
  children?: ReactNode;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  /** Override the haptic feedback style. Defaults to variant-appropriate. */
  hapticStyle?: 'tap' | 'bump' | 'thud' | 'select' | 'none';
  /** Accessibility label (defaults to label string). */
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  labelStyle,
  hapticStyle,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (isDisabled) return;
    scale.value = withSpring(0.97, { mass: 0.4, damping: 14, stiffness: 220 });
  }, [isDisabled, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { mass: 0.4, damping: 14, stiffness: 220 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (isDisabled || !onPress) return;
    const fb = hapticStyle ?? variantHaptic(variant);
    if (fb !== 'none') haptics[fb]();
    void onPress();
  }, [isDisabled, onPress, hapticStyle, variant]);

  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        { paddingHorizontal: s.paddingX, paddingVertical: s.paddingY, borderRadius: s.radius },
        v.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.spinnerColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.iconLeft}>{icon}</View> : null}
          {children ?? (
            label ? (
              <Text
                style={[
                  styles.label,
                  { fontSize: s.fontSize, color: v.labelColor },
                  labelStyle,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            ) : null
          )}
          {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

function variantHaptic(variant: Variant): 'tap' | 'bump' | 'thud' | 'select' {
  switch (variant) {
    case 'primary':
      return 'bump';
    case 'destructive':
      return 'thud';
    case 'secondary':
    case 'outline':
      return 'tap';
    default:
      return 'select';
  }
}

const variantStyles: Record<
  Variant,
  { container: ViewStyle; labelColor: string; spinnerColor: string }
> = {
  primary: {
    container: { backgroundColor: colors.emerald },
    labelColor: colors.textOnAccent,
    spinnerColor: colors.textOnAccent,
  },
  secondary: {
    container: { backgroundColor: colors.surface800 },
    labelColor: colors.textPrimary,
    spinnerColor: colors.textPrimary,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    labelColor: colors.textPrimary,
    spinnerColor: colors.textPrimary,
  },
  destructive: {
    container: { backgroundColor: colors.rose },
    labelColor: colors.textOnAccent,
    spinnerColor: colors.textOnAccent,
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    labelColor: colors.textPrimary,
    spinnerColor: colors.textPrimary,
  },
};

const sizeStyles: Record<Size, { paddingX: number; paddingY: number; fontSize: number; radius: number }> =
  {
    sm: { paddingX: spacing.md, paddingY: spacing.sm, fontSize: 13, radius: radii.sm },
    md: { paddingX: spacing.lg, paddingY: spacing.md, fontSize: 15, radius: radii.md },
    lg: { paddingX: spacing.xl, paddingY: spacing.lg, fontSize: 16, radius: radii.lg },
  };

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  iconLeft: { marginRight: 2 },
  iconRight: { marginLeft: 2 },
});
