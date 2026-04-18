/**
 * WizardShell — scaffold for multi-step capture flows.
 *
 * Handles: header with step dots, back/close, body scroll, sticky footer
 * with Next / Save buttons, and the auto-slide step transition.
 *
 * Callers supply an array of `WizardStepDef`s and own the form state. The
 * shell just renders the current step's content and wires navigation.
 */
import React, { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { X, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from './SafeScreen';
import { Button } from './Button';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export interface WizardStepDef {
  key: string;
  title: string;
  subtitle?: string;
  /** Return true if step is valid and the user can advance. Defaults to true. */
  canAdvance?: () => boolean;
  /** The step body. Owns its own inputs and calls back up to the parent. */
  render: () => ReactNode;
}

export interface WizardShellProps {
  steps: WizardStepDef[];
  /** Label for the final button (defaults to "Save"). */
  finishLabel?: string;
  onFinish: () => Promise<void> | void;
  onCancel?: () => void;
  /** If true, shows a loading spinner on the Next/Save button. */
  saving?: boolean;
  /** Accent color for step dots & progress. */
  accent?: string;
}

export function WizardShell({
  steps,
  finishLabel = 'Save',
  onFinish,
  onCancel,
  saving = false,
  accent = colors.emerald,
}: WizardShellProps) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const current = steps[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;

  const advanceAllowed = useMemo(
    () => (current.canAdvance ? current.canAdvance() : true),
    [current]
  );

  const handleBack = useCallback(() => {
    haptics.tap();
    if (isFirst) {
      onCancel ? onCancel() : router.back();
      return;
    }
    setStepIdx((i) => Math.max(0, i - 1));
  }, [isFirst, onCancel, router]);

  const handleNext = useCallback(async () => {
    if (!advanceAllowed || saving) {
      haptics.warn();
      return;
    }
    if (isLast) {
      haptics.success();
      await onFinish();
      return;
    }
    haptics.bump();
    setStepIdx((i) => Math.min(steps.length - 1, i + 1));
  }, [advanceAllowed, saving, isLast, onFinish, steps.length]);

  const handleClose = useCallback(() => {
    haptics.tap();
    onCancel ? onCancel() : router.back();
  }, [onCancel, router]);

  return (
    <SafeScreen bottom="inset" scroll={false} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header row */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isFirst ? 'Cancel' : 'Back'}
            style={styles.headerBtn}
          >
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>
          <StepDots count={steps.length} active={stepIdx} accent={accent} />
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.headerBtn}
          >
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{current.title}</Text>
          {current.subtitle ? (
            <Text style={styles.subtitle}>{current.subtitle}</Text>
          ) : null}
        </View>

        {/* Step body */}
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {current.render()}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          {!isFirst ? (
            <Button
              label="Back"
              variant="ghost"
              onPress={handleBack}
              hapticStyle="tap"
              style={styles.footerBack}
            />
          ) : null}
          <Button
            label={isLast ? finishLabel : 'Next'}
            variant="primary"
            onPress={handleNext}
            disabled={!advanceAllowed}
            loading={saving && isLast}
            fullWidth
            style={styles.footerNext}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function StepDots({
  count,
  active,
  accent,
}: {
  count: number;
  active: number;
  accent: string;
}) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === active;
        const isDone = i < active;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              (isActive || isDone) && { backgroundColor: accent, width: isActive ? 18 : 8 },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface700,
  },
  titleBlock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerBack: {
    flexShrink: 0,
  },
  footerNext: {
    flex: 1,
  },
});
