/**
 * Input — text input with dark-theme chrome, label, helper text, and error state.
 *
 * Supports icon slots on either side (e.g., lucide-react-native icons).
 * Use `multiline` for text areas. Exposes ref so callers can focus imperatively.
 */
import React, { forwardRef, ReactNode, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing, typography } from '@/lib/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string | null;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Style applied to the outer container (label + field + helper). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Style applied to the underlying TextInput. */
  inputStyle?: StyleProp<TextStyle>;
  /** Optional right-side action (e.g., show/hide password button). */
  actionRight?: ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    helper,
    error,
    iconLeft,
    iconRight,
    actionRight,
    containerStyle,
    inputStyle,
    multiline,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          hasError && styles.fieldError,
          multiline && styles.fieldMultiline,
        ]}
      >
        {iconLeft ? <View style={styles.iconLeft}>{iconLeft}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.emerald}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            inputStyle,
          ]}
        />
        {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
        {actionRight ? <View style={styles.actionRight}>{actionRight}</View> : null}
      </View>
      {hasError ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    backgroundColor: colors.surface800,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  fieldFocused: {
    borderColor: colors.emerald,
  },
  fieldError: {
    borderColor: colors.rose,
  },
  fieldMultiline: {
    minHeight: 96,
    paddingVertical: spacing.md,
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    paddingVertical: 0,
    textAlignVertical: 'top',
    minHeight: 72,
  },
  iconLeft: { marginRight: spacing.sm },
  iconRight: { marginLeft: spacing.sm },
  actionRight: { marginLeft: spacing.sm },
  helper: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.rose,
    marginTop: spacing.xs,
  },
});
