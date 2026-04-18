/**
 * Root layout — the outermost wrapper for the entire app.
 *
 *   ErrorBoundary
 *     └ GestureHandlerRootView
 *         └ SafeAreaProvider
 *             └ QueryClientProvider (react-query)
 *                 └ AuthProvider
 *                     └ SplashGate
 *                         ├ <Slot /> (renders the matched route subtree)
 *                         ├ <AnnouncementModal /> (global founder-broadcast receiver)
 *                         └ <UpdatesListener /> (silent EAS Update OTA poller)
 *
 * Also configures:
 *   • Dark status bar text (light content on dark surfaces)
 *   • Splash screen: hide AFTER auth has bootstrapped so users never see a flash
 *     of a wrong screen.
 *   • OTA updates: a JS-only push lands on devices in ~30s via `eas update`.
 *     `UpdatesListener` fetches the newest bundle on boot + on AppState=active
 *     and applies it on the next cold start (never mid-session).
 */
import '../global.css';

import React, { useEffect } from 'react';
import { AppState, AppStateStatus, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { colors } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnnouncementModal } from '@/components/AnnouncementModal';
import { checkForUpdatesSilently } from '@/lib/updates';

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

/**
 * Silent OTA updater — checks Expo on boot and every time the app resumes.
 * If a newer bundle is available, stages it. Apply happens on next cold start.
 * No-op in __DEV__ and when Updates.isEnabled is false (e.g. Expo Go).
 */
function UpdatesListener() {
  useEffect(() => {
    void checkForUpdatesSilently();
    const handler = (state: AppStateStatus) => {
      if (state === 'active') void checkForUpdatesSilently();
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, []);
  return null;
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
                {/* Global receiver — floats over every screen once auth is ready. */}
                <AnnouncementModal />
                {/* Background OTA poller — silent fetch, applies on next cold start. */}
                <UpdatesListener />
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
