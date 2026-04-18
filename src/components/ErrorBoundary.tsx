/**
 * ErrorBoundary — last-resort catch-all for the entire app.
 *
 * Mounted at the root in app/_layout.tsx. If any render throws, we show a
 * readable error screen instead of letting the OS force-close the APK. This
 * is especially important in production builds where JS-level crashes give
 * no console output on the device.
 *
 * The "Try Again" button flips a reset counter to remount the subtree. The
 * error + stack are rendered on-screen so the user can screenshot them if
 * something is deeply broken.
 */
import React, { Component, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: { componentStack?: string } | null;
  resetKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, info: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] captured:', error, info?.componentStack);
    this.setState({ info });
  }

  handleReset = () => {
    this.setState((s) => ({ error: null, info: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    const { error, info, resetKey } = this.state;
    if (!error) {
      // resetKey forces a full remount of the child tree on "Try Again"
      return <React.Fragment key={resetKey}>{this.props.children}</React.Fragment>;
    }

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Liftori</Text>
          </View>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.subtitle}>
            The app hit an error it couldn&apos;t recover from. Tap Try Again, or screenshot the
            details below and send them to Ryan.
          </Text>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Error</Text>
            <Text style={styles.panelText}>
              {error.name}: {error.message || '(no message)'}
            </Text>

            {error.stack ? (
              <>
                <Text style={[styles.panelLabel, styles.panelLabelTop]}>Stack</Text>
                <Text style={styles.mono}>{error.stack}</Text>
              </>
            ) : null}

            {info?.componentStack ? (
              <>
                <Text style={[styles.panelLabel, styles.panelLabelTop]}>Component stack</Text>
                <Text style={styles.mono}>{info.componentStack}</Text>
              </>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Button label="Try Again" onPress={this.handleReset} variant="primary" />
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface900,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl * 2,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: radii.pill,
  },
  badgeText: {
    ...typography.micro,
    color: colors.emerald,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  panel: {
    backgroundColor: colors.surface800,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  panelLabelTop: {
    marginTop: spacing.md,
  },
  panelText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  actions: {
    gap: spacing.sm,
  },
});
