/**
 * Card — the neutral container used for every list row, detail block, and panel.
 *
 * Supports:
 *   • `onPress` — makes it pressable with haptic + press animation
 *   • `variant` — `flat` (default), `elevated` (shadow), `outline` (border only)
 *   • `accent`  — optional left-edge color bar (e.g., severity/state)
 */
import React, { ReactNode, useCallback } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

type Variant = 'flat' | 'elevated' | 'outline';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void | Promise<void>;
  onLongPress?: () => void | Promise<void>;
  variant?: Variant;
  accent?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  children,
  onPress,
  onLongPress,
  variant = 'flat',
  accent,
  padded = true,
  style,
  disabled = false,
  testID,
}: CardProps) {
  const pressable = Boolean(onPress || onLongPress);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    if (!pressable || disabled) return;
    scale.value = withSpring(0.985, { mass: 0.4, damping: 14, stiffness: 220 });
  }, [pressable, disabled, scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { mass: 0.4, damping: 14, stiffness: 220 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled || !onPress) return;
    haptics.tap();
    void onPress();
  }, [disabled, onPress]);

  const handleLongPress = useCallback(() => {
    if (disabled || !onLongPress) return;
    haptics.thud();
    void onLongPress();
  }, [disabled, onLongPress]);

  const body = (
    <View style={styles.inner}>
      {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
      <View style={[padded && styles.padded, accent && { marginLeft: 4 }]}>{children}</View>
    </View>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.container,
    variantStyles[variant],
    disabled && styles.disabled,
    style,
  ];

  if (!pressable) return <View style={containerStyle}>{body}</View>;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
      style={[containerStyle, animatedStyle]}
    >
      {body}
    </AnimatedPressable>
  );
}

const variantStyles: Record<Variant, ViewStyle> = {
  flat: {
    backgroundColor: colors.surface800,
  },
  elevated: {
    backgroundColor: colors.surface800,
    ...shadows.card,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
  },
  padded: {
    flex: 1,
    padding: spacing.lg,
  },
  accent: {
    width: 4,
  },
  disabled: { opacity: 0.55 },
});
