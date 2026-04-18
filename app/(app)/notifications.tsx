/**
 * Notifications Inbox (Wave 8, mobile).
 *
 * Mirrors the desktop NotificationBell dropdown — but on mobile we render
 * the list as a full screen pushed on top of the tabs (hidden from the
 * tab bar via the (app)/_layout.tsx `href: null` option).
 *
 * Behavior:
 *   • Loads the most recent 30 rows for the signed-in user on mount
 *   • Subscribes to Realtime INSERTs so new notifications prepend live
 *   • Pull-to-refresh and AppState=active re-fetch to catch missed rows
 *   • Tapping an unread row marks it read, then — if it has a `link` —
 *     navigates there. Rally callIds get punted back to chat for now
 *     (no in-app Video Chat on mobile yet).
 *   • "Mark all read" bulk-flips every unread row for this user.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  CheckCheck,
  FileText,
  Mail,
  MessageSquare,
  Ticket,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import {
  Notification,
  NotificationType,
  fetchNotifications,
  markAllRead,
  markAsRead,
  subscribeToNotifications,
  timeAgo,
} from '@/lib/notificationsService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

const ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  ticket: Ticket,
  ticket_reply: Ticket,
  message: MessageSquare,
  project_update: FileText,
  general: Bell,
};

function iconFor(type: NotificationType) {
  return ICONS[type] ?? Bell;
}

function tintFor(type: NotificationType): string {
  switch (type) {
    case 'ticket':
    case 'ticket_reply':
      return colors.amber;
    case 'message':
      return colors.sky;
    case 'project_update':
      return colors.emerald;
    default:
      return colors.purple;
  }
}

export default function NotificationsInbox() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await fetchNotifications(user.id, 30);
      if (mountedRef.current) setRows(data);
    } catch {
      // non-fatal — keep any stale rows we have
    }
  }, [user?.id]);

  // Initial fetch
  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      if (mountedRef.current) setLoading(false);
    })();
  }, [load]);

  // Re-fetch when app resumes, in case we missed Realtime events while
  // the socket was asleep.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') void load();
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [load]);

  // Realtime: prepend new rows as they land
  useEffect(() => {
    if (!user?.id) return;
    const off = subscribeToNotifications(user.id, (n) => {
      if (!mountedRef.current) return;
      setRows((prev) => {
        if (prev.some((r) => r.id === n.id)) return prev;
        return [n, ...prev];
      });
    });
    return off;
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mountedRef.current) setRefreshing(false);
  }, [load]);

  const unreadCount = rows.reduce((n, r) => n + (r.read ? 0 : 1), 0);

  const handleTap = useCallback(
    async (n: Notification) => {
      haptics.tap();
      // Optimistically flip unread → read
      if (!n.read) {
        setRows((prev) =>
          prev.map((r) => (r.id === n.id ? { ...r, read: true } : r)),
        );
        void markAsRead(n.id).catch(() => {
          // revert on failure
          setRows((prev) =>
            prev.map((r) => (r.id === n.id ? { ...r, read: false } : r)),
          );
        });
      }

      if (!n.link) return;

      // Rally call deep-links don't have a mobile surface yet — drop the
      // user at the Chat tab so they can still respond by message.
      if (n.link.includes('callId=') || n.link.toLowerCase().includes('rally')) {
        router.push('/chat' as any);
        return;
      }

      // Map common desktop admin routes to mobile equivalents
      if (n.link.startsWith('/admin/chat')) {
        router.push('/chat' as any);
        return;
      }
      if (n.link.startsWith('/lead/') || n.link.startsWith('/admin/lead/')) {
        const id = n.link.split('/').pop();
        if (id) router.push(`/lead/${id}` as any);
        return;
      }

      // Unknown deep link — fall back to chat, which is the most common
      // destination for inbox items today.
      router.push('/chat' as any);
    },
    [router],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!user?.id || unreadCount === 0 || sweeping) return;
    haptics.select();
    setSweeping(true);
    const snapshot = rows;
    // Optimistic
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    try {
      await markAllRead(user.id);
    } catch {
      // revert
      if (mountedRef.current) setRows(snapshot);
    } finally {
      if (mountedRef.current) setSweeping(false);
    }
  }, [rows, sweeping, unreadCount, user?.id]);

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => {
      const Icon = iconFor(item.type);
      const tint = tintFor(item.type);
      return (
        <Pressable
          onPress={() => handleTap(item)}
          style={({ pressed }) => [
            styles.row,
            !item.read && styles.rowUnread,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: tint + '22' }]}>
            <Icon size={20} color={tint} />
          </View>
          <View style={styles.rowText}>
            <View style={styles.rowTitleLine}>
              <Text
                numberOfLines={1}
                style={[
                  styles.rowTitle,
                  !item.read && styles.rowTitleUnread,
                ]}
              >
                {item.title}
              </Text>
              {!item.read ? <View style={styles.unreadDot} /> : null}
            </View>
            {item.body ? (
              <Text numberOfLines={2} style={styles.rowBody}>
                {item.body}
              </Text>
            ) : null}
            <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
          </View>
        </Pressable>
      );
    },
    [handleTap],
  );

  const trailing =
    unreadCount > 0 ? (
      <Pressable
        onPress={handleMarkAllRead}
        hitSlop={10}
        style={({ pressed }) => [styles.markAllBtn, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel="Mark all notifications as read"
      >
        <CheckCheck size={14} color={colors.sky} />
        <Text style={styles.markAllText}>Mark all</Text>
      </Pressable>
    ) : null;

  return (
    <SafeScreen bottom="skip">
      <Header
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        onBack={() => router.back()}
        trailing={trailing}
      />

      {loading ? (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Mail size={28} color={colors.textMuted} />}
            title="No notifications yet"
            body="When something needs your attention, it will show up here."
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={onRefresh}
          refreshing={refreshing}
          ItemSeparatorComponent={Separator}
        />
      )}
    </SafeScreen>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sep: {
    height: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: {
    backgroundColor: colors.surface700,
    borderColor: colors.borderStrong,
  },
  rowPressed: { opacity: 0.7 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  rowTitleUnread: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rowBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowTime: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.sky,
    marginLeft: 'auto',
  },

  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  emptyWrap: {
    padding: spacing.xl,
  },

  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markAllText: {
    ...typography.micro,
    color: colors.sky,
    fontWeight: '700',
  },
});
