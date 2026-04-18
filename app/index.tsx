/**
 * Root index — redirects based on auth state.
 *
 *   • Authenticated → /(app)/home
 *   • Unauthenticated → /(auth)/login
 *
 * This file should contain NO UI beyond the redirect component. The SplashGate
 * in _layout.tsx keeps the splash visible until auth has resolved, so by the
 * time this renders we know the redirect target with certainty.
 */
import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/AuthContext';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/(app)/home' : '/(auth)/login'} />;
}
