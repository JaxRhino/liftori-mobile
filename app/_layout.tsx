/**
 * Root layout — the outermost wrapper for the entire app.
 *
 *   SafeAreaProvider
 *     └ GestureHandlerRootView
 *         └ QueryClientProvider (react-query)
 *             └ AuthProvider
 *                 └ <Slot /> (renders the matched route subtree)
 *
 * Also configures:
 *   • Dark status bar text (light content on dark surfaces)
 *   • Splash screen: hide AFTER auth has bootstrapped so users never see a flash
 *     of a wrong screen.
 */
import '../global.css';

import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { colors } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Keep the splash visible until we've read the persisted session.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* noop — already hidden */
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {
        /* already hidden */
      });
    }
  }, [loading]);

  if (loading) return <View style={styles.splashBg} />;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="light" />
              <SplashGate>
                <Slot />
              </SplashGate>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface900 },
  splashBg: { flex: 1, backgroundColor: colors.surface900 },
});
