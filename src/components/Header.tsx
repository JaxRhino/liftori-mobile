/**
 * Header — the canonical in-screen header bar.
 *
 * Sits INSIDE a SafeScreen (SafeScreen handles the top inset; the Header just
 * lays out title + leading/trailing slots beneath that).
 *
 * Use `back` for a back-arrow on stack screens (calls router.back() via the
 * callback you provide). Use `leading` / `trailing` to inject custom controls.
 */
import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onBack?: () => void;
  /** Show a hairline bottom border. Default: false. */
  bordered?: boolean;
  /** Center-align the title. Default: false (left-aligned). */
  centerTitle?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Header({
  title,
  subtitle,
  leading,
  trailing,
  onBack,
  bordered = false,
  centerTitle = false,
  style,
}: HeaderProps) {
  const showBack = Boolean(onBack);

  return (
    <View style={[styles.container, bordered && styles.bordered, style]}>
      <View style={styles.slotLeading}>
        {showBack ? (
          <Pressable
            onPress={() => {
              haptics.tap();
              onBack?.();
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={26} color={colors.textPrimary} />
          </Pressable>
        ) : (
          leading
        )}
      </View>

      <View style={[styles.titleBlock, centerTitle && styles.titleCenter]}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.slotTrailing}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  bordered: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  slotLeading: {
    minWidth: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  slotTrailing: {
    minWidth: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  titleCenter: {
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  pressed: { opacity: 0.6 },
});
