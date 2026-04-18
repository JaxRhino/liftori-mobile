/**
 * Login screen — email + password sign-in against Supabase Auth.
 *
 * Visual: brand-forward hero ("Liftori" wordmark + "Lift Your Idea." tagline),
 * emerald gradient accent, card-style form, haptic feedback on sign-in,
 * success/error states surfaced inline.
 *
 * No signup from mobile (for now) — all users are provisioned via the admin
 * dashboard or consulting onboarding wizard.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeScreen } from '@/components/SafeScreen';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/AuthContext';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export default function LoginScreen() {
  const { signInWithPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  const handleSubmit = useCallback(async () => {
    Keyboard.dismiss();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      haptics.warn();
      return;
    }
    setSubmitting(true);
    const { error: authError } = await signInWithPassword(email, password);
    setSubmitting(false);
    if (authError) {
      setError(authError);
      haptics.error();
    } else {
      haptics.success();
    }
  }, [email, password, signInWithPassword]);

  return (
    <SafeScreen scroll>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.wrap}>
          <LinearGradient
            colors={['rgba(16,185,129,0.15)', 'transparent']}
            style={styles.topGlow}
            pointerEvents="none"
          />

          <View style={styles.brand}>
            <View style={styles.logoMark}>
              <View style={[styles.bar, { height: 14, opacity: 0.55 }]} />
              <View style={[styles.bar, { height: 22, opacity: 0.8 }]} />
              <View style={[styles.bar, { height: 30, opacity: 1 }]} />
            </View>
            <Text style={styles.wordmark}>Liftori</Text>
            <Text style={styles.tagline}>Lift Your Idea.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Sign in to your Liftori team account.
            </Text>

            <View style={{ height: spacing.xl }} />

            <Input
              label="Email"
              placeholder="you@liftori.ai"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
              iconLeft={<Mail size={18} color={colors.textSecondary} />}
            />

            <View style={{ height: spacing.lg }} />

            <Input
              ref={passwordRef}
              label="Password"
              placeholder="••••••••"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleSubmit}
              iconLeft={<Lock size={18} color={colors.textSecondary} />}
              actionRight={
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    haptics.select();
                    setShow((s) => !s);
                  }}
                >
                  {show ? (
                    <EyeOff size={18} color={colors.textSecondary} />
                  ) : (
                    <Eye size={18} color={colors.textSecondary} />
                  )}
                </Pressable>
              }
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={{ height: spacing.xl }} />

            <Button
              label="Sign In"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              onPress={handleSubmit}
            />
          </View>

          <Text style={styles.footnote}>
            Accounts are provisioned by the Liftori team. If you need access, ping
            your project lead.
          </Text>
        </View>
      </TouchableWithoutFeedback>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  brand: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xxxl,
  },
  logoMark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 36,
    marginBottom: spacing.lg,
  },
  bar: {
    width: 8,
    backgroundColor: colors.emerald,
    borderRadius: 2,
  },
  wordmark: {
    ...typography.display,
    color: colors.textPrimary,
  },
  tagline: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: colors.surface800,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
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
  errorText: {
    ...typography.caption,
    color: colors.rose,
    marginTop: spacing.md,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
});
