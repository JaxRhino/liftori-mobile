/**
 * Chat — channel list.
 *
 * Two sections:
 *   • Channels — internal team rooms (#general, #dev, …)
 *   • Direct Messages — client DM channels + any other 1:1
 *
 * Taps push `/chat/[channelId]`. Pull-to-refresh re-loads everything.
 * Last-message previews are fetched in parallel per channel.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Hash, MessageCircle, Users } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  ChatChannel,
  ChatMessage,
  formatMessageTime,
  getLastMessage,
  listChannels,
} from '@/lib/chatService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

interface ChannelWithPreview extends ChatChannel {
  lastMessage?: ChatMessage | null;
}

export default function ChatChannelList() {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const list = await listChannels();
      // Kick off all previews in parallel
      const withPreviews = await Promise.all(
        list.map(async (ch) => {
          try {
            const last = await getLastMessage(ch.id);
            return { ...ch, lastMessage: last } as ChannelWithPreview;
          } catch {
            return { ...ch, lastMessage: null } as ChannelWithPreview;
          }
        })
      );
      // Sort by most-recent activity, fallback to created_at
      withPreviews.sort((a, b) => {
        const aTs = a.lastMessage?.created_at ?? a.created_at;
        const bTs = b.lastMessage?.created_at ?? b.created_at;
        return aTs < bTs ? 1 : -1;
      });
      setChannels(withPreviews);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[chat] listChannels failed:', e);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchChannels();
      setLoading(false);
    })();
  }, [fetchChannels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchChannels();
    setRefreshing(false);
  }, [fetchChannels]);

  const openChannel = (id: string) => {
    haptics.tap();
    router.push(`/chat/${id}` as any);
  };

  const internal = channels.filter((c) => c.channel_type === 'internal');
  const dms = channels.filter((c) => c.channel_type === 'client_dm');

  return (
    <SafeScreen bottom="skip" scroll onRefresh={onRefresh} refreshing={refreshing}>
      <Header title="Chat" subtitle="Team & client conversations" />

      <View style={styles.body}>
        {loading ? (
          <Card variant="flat" style={styles.emptyCard}>
            <Text style={styles.muted}>Loading channels…</Text>
          </Card>
        ) : channels.length === 0 ? (
          <Card variant="outline" style={styles.emptyCard}>
            <EmptyState
              compact
              icon={<MessageCircle size={24} color={colors.textMuted} />}
              title="No channels yet"
              description="Admins create channels on the desktop dashboard. They'll appear here once they exist."
            />
          </Card>
        ) : (
          <>
            {internal.length > 0 && (
              <Section
                icon={<Hash size={16} color={colors.textMuted} />}
                title="Channels"
                count={internal.length}
              >
                {internal.map((ch) => (
                  <ChannelRow key={ch.id} channel={ch} onPress={() => openChannel(ch.id)} />
                ))}
              </Section>
            )}

            {dms.length > 0 && (
              <Section
                icon={<Users size={16} color={colors.textMuted} />}
                title="Direct Messages"
                count={dms.length}
              >
                {dms.map((ch) => (
                  <ChannelRow key={ch.id} channel={ch} onPress={() => openChannel(ch.id)} />
                ))}
              </Section>
            )}
          </>
        )}
      </View>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ChannelRow({
  channel,
  onPress,
}: {
  channel: ChannelWithPreview;
  onPress: () => void;
}) {
  const isDM = channel.channel_type === 'client_dm';
  const title = isDM ? channel.name : `#${channel.name}`;
  const preview = channel.lastMessage?.content ?? channel.description ?? 'No messages yet';
  const ts = channel.lastMessage?.created_at ?? channel.created_at;

  return (
    <Card variant="flat" onPress={onPress} style={styles.row}>
      <View style={styles.rowInner}>
        <View style={styles.avatarSlot}>
          {isDM ? (
            <Avatar name={channel.name} size="md" />
          ) : (
            <View style={styles.hashBadge}>
              <Hash size={20} color={colors.emerald} />
            </View>
          )}
        </View>

        <View style={styles.rowMain}>
          <View style={styles.rowTopLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.rowTs}>{formatMessageTime(ts)}</Text>
          </View>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyCard: {
    paddingVertical: spacing.md,
  },

  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sectionBody: {
    gap: spacing.sm,
  },

  row: {
    padding: 0,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarSlot: {
    width: 40,
    alignItems: 'center',
  },
  hashBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  rowTs: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowPreview: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
