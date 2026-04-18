/**
 * Auth group layout — a stack with no header (screens render their own).
 *
 * If a session already exists, bounce to /(app) so an authed user never sees
 * the login screen again.
 */
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/AuthContext';

export default function AuthLayout() {
  const { session } = useAuth();
  if (session) return <Redirect href="/(app)/home" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0f172a' },
        animation: 'fade',
      }}
    />
  );
}
