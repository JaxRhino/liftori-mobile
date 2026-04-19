/**
 * (app) — authenticated tab shell.
 *
 * Five tabs, with Create (+) in the middle as the flagship "quick capture"
 * entrypoint (Wave 1 wizard target).
 *
 *   Home · Work · Create · Chat · More
 *
 * Guards: if there's no session, redirect out to the login screen.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Home, Briefcase, Plus, MessageCircle, Menu } from 'lucide-react-native';
import { useAuth } from '@/lib/AuthContext';
import { colors, radii, shadows, spacing } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarStyle: {
          backgroundColor: colors.surface900,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size ?? 22} color={color} />,
          tabBarButton: (props) => <HapticTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: 'Work',
          tabBarIcon: ({ color, size }) => <Briefcase size={size ?? 22} color={color} />,
          tabBarButton: (props) => <HapticTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => <CreateFab focused={focused} />,
          tabBarButton: (props) => <HapticTabButton {...props} hapticKind="bump" />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size ?? 22} color={color} />
          ),
          tabBarButton: (props) => <HapticTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Menu size={size ?? 22} color={color} />,
          tabBarButton: (props) => <HapticTabButton {...props} />,
        }}
      />
      {/* Pushable routes — hidden from the tab bar.
          IMPORTANT: every route folder under (app)/ must be listed here with
          `href: null`, otherwise expo-router auto-adds it as a visible tab
          on the far right with no title/icon — rendering as a "box with X"
          fallback. This bit us with `lead/` which surfaced as a broken
          sixth tab on Ryan's device. */}
      <Tabs.Screen name="lead" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="bug-report" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="my-qr" options={{ href: null }} />
      <Tabs.Screen name="investor-qr" options={{ href: null }} />
      <Tabs.Screen name="hiring-qr" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="tasks" options={{ href: null }} />
      <Tabs.Screen name="notes" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="customer" options={{ href: null }} />
      <Tabs.Screen name="docs" options={{ href: null }} />
      <Tabs.Screen name="doc" options={{ href: null }} />
      <Tabs.Screen name="assistant" options={{ href: null }} />
    </Tabs>
  );
}

/** Floating emerald plus button for the center tab. */
function CreateFab({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.fabWrap, focused && styles.fabWrapFocused]}>
      <View style={styles.fabCore}>
        <Plus size={24} color={colors.textOnAccent} strokeWidth={2.5} />
      </View>
    </View>
  );
}

type HapticTabButtonProps = {
  children?: React.ReactNode;
  onPress?: (e: any) => void;
  onLongPress?: (e: any) => void;
  hapticKind?: 'tap' | 'bump' | 'select';
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  testID?: string;
  style?: any;
};

function HapticTabButton({
  children,
  onPress,
  onLongPress,
  hapticKind = 'tap',
  accessibilityState,
  accessibilityLabel,
  testID,
  style,
}: HapticTabButtonProps) {
  return (
    <Pressable
      onPress={(e) => {
        haptics[hapticKind]();
        onPress?.(e);
      }}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      android_ripple={null}
      style={[styles.tabButton, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: {
    width: 52,
    height: 52,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    overflow: 'hidden',
    ...shadows.card,
  },
  fabWrapFocused: {
    transform: [{ scale: 1.05 }],
  },
  fabCore: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface900,
  },
});
