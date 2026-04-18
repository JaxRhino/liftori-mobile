/**
 * SafeScreen — the canonical wrapper for every mobile screen.
 *
 * Handles:
 *   • top safe-area inset (status bar / notch / dynamic island)
 *   • bottom safe-area inset (home indicator / Android gesture nav)
 *   • dark theme background
 *   • optional header
 *   • optional scroll behavior with pull-to-refresh and keyboard avoidance
 *
 * USE THIS ON EVERY ROUTE. Never place raw <View> at the route root —
 * it will slide under the home indicator on iOS and the gesture bar on Android.
 */
import React, { forwardRef, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/lib/theme';

type EdgeBehavior = 'apply' | 'skip';

export interface SafeScreenProps {
  /**
   * If true, children render inside a ScrollView.
   * Default: false — many screens (chat, lists) manage their own scrolling.
   */
  scroll?: boolean;
  /** Called on pull-to-refresh. Only active when `scroll` is true. */
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
  /**
   * How to handle the bottom safe-area inset.
   *   • "apply"  — add padding-bottom so content never slides under the
   *               home indicator. **This is the default.**
   *   • "skip"   — leave content to the screen edge (used when a tab bar
   *               already handles its own inset, or by the TabLayout itself).
   */
  bottom?: EdgeBehavior;
  /** How to handle the top safe-area inset. Default: "apply". */
  top?: EdgeBehavior;
  /** Dark theme background override. Defaults to brand surface900. */
  backgroundColor?: string;
  /** Disable keyboard avoidance (rarely needed). */
  disableKeyboardAvoid?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export const SafeScreen = forwardRef<ScrollView | View, SafeScreenProps>(
  function SafeScreen(
    {
      scroll = false,
      onRefresh,
      refreshing = false,
      bottom = 'apply',
      top = 'apply',
      backgroundColor = colors.surface900,
      disableKeyboardAvoid = false,
      style,
      contentContainerStyle,
      children,
    },
    ref
  ) {
    const insets = useSafeAreaInsets();

    const paddingTop = top === 'apply' ? insets.top : 0;
    const paddingBottom = bottom === 'apply' ? Math.max(insets.bottom, 12) : 0;

    const containerStyle: StyleProp<ViewStyle> = [
      styles.container,
      { backgroundColor, paddingTop, paddingBottom },
      style,
    ];

    const Inner = scroll ? ScrollView : View;

    const innerProps: any = scroll
      ? {
          ref,
          contentContainerStyle: [styles.scrollContent, contentContainerStyle],
          keyboardShouldPersistTaps: 'handled',
          showsVerticalScrollIndicator: false,
          refreshControl: onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textSecondary}
              colors={[colors.emerald]}
              progressBackgroundColor={colors.surface800}
            />
          ) : undefined,
        }
      : { ref, style: styles.flex };

    const content = (
      <View style={containerStyle}>
        <StatusBar style="light" />
        <Inner {...innerProps}>{children}</Inner>
      </View>
    );

    if (disableKeyboardAvoid) return content;

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
