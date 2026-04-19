/**
 * Chat — channel list.
 *
 * Three sections:
 *   • Starred          — user-pinned channels / DMs
 *   • Channels         — public + private team rooms (#general, #dev, …)
 *   • Direct Messages  — 1:1 conversations (type='direct')
 *
 * Each row shows the channel name, last-message preview, relative timestamp,
 * and an unread-count badge. Tapping a row pushes `/chat/[channelId]`.
 *
 * Real-time: any new chat_messages INSERT triggers a debounced re-fetch so
 * previews and unread counts stay live while the screen is open.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Hash, Lock, MessageCircle, Star, Users, VolumeX } from 'lucide-react-native';
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
  getUnreadCount,
  getUserPreferences,
  listChannelMembers,
  listChannels,
  subscribeToAnyMessage,
} from '@/lib/chatService';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

interface EnrichedChannel extends ChatChannel {
  lastMessage: ChatMessage | null;
  unread: number;
  /** Resolved counterparty for DM channels, else null. */
  dmPartner: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

export default function ChatChannelList() {
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;

  const [channels, setChannels] = useState<EnrichedChannel[]>([]);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [list, prefs] = await Promise.all([listChannels(), getUserPreferences()]);
      setStarredIds(new Set(prefs?.starred_channels ?? []));
      setMutedIds(new Set(prefs?.muted_channels ?? []));

      // Enrich each channel with preview, unread count, DM counterparty.
      const enriched = await Promise.all(
        list.map(async (ch) => {
          const [last, unread, dmPartner] = await Promise.all([
            getLastMessage(ch.id).catch(() => null),
            getUnreadCount(ch.id).catch(() => 0),
            ch.type === 'direct' && myId
              ? resolveDmPartner(ch.id, myId).catch(() => null)
              : Promise.resolve(null),
          ]);
          return {
            ...ch,
            lastMessage: last,
            unread,
            dmPartner,
          } as EnrichedChannel;
        })
      );

      // Most-recent-activity first; fall back to created_at.
      enriched.sort((a, b) => {
        const aTs = a.lastMessage?.created_at ?? a.created_at;
        const bTs = b.lastMessage?.created_at ?? b.created_at;
        return aTs < bTs ? 1 : -1;
      });
      setChannels(enriched);
    } catch (e) {
      console.warn('[chat] fetchAll failed:', e);
    }
  }, [myId]);

  // Initial load
  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [fetchAll]);

  // Real-time — re-fetch on any new chat_messages INSERT. Debounced so a
  // burst of messages doesn't blast the DB.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsub = subscribeToAnyMessage(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchAll();
      }, 400);
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsub();
    };
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const openChannel = (id: string) => {
    haptics.tap();
    router.push(`/chat/${id}` as any);
  };

  const { starred, channelsList, dms } = useMemo(() => {
    const starred: EnrichedChannel[] = [];
    const channelsList: EnrichedChannel[] = [];
    const dms: EnrichedChannel[] = [];
    for (const ch of channels) {
      if (starredIds.has(ch.id)) starred.push(ch);
      else if (ch.type === 'direct') dms.push(ch);
      else channelsList.push(ch);
    }
    return { starred, channelsList, dms };
  }, [channels, starredIds]);

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
            {starred.length > 0 && (
              <Section
                icon={<Star size={16} color={colors.amber ?? colors.textMuted} />}
                title="Starred"
                count={starred.length}
              >
                {starred.map((ch) => (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    muted={mutedIds.has(ch.id)}
                    onPress={() => openChannel(ch.id)}
                  />
                ))}
              </Section>
            )}

            {channelsList.length > 0 && (
              <Section
                icon={<Hash size={16} color={colors.textMuted} />}
                title="Channels"
                count={channelsList.length}
              >
                {channelsList.map((ch) => (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    muted={mutedIds.has(ch.id)}
                    onPress={() => openChannel(ch.id)}
                  />
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
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    muted={mutedIds.has(ch.id)}
                    onPress={() => openChannel(ch.id)}
                  />
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
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * For a DM channel, look up the *other* user's profile. Returns null if
 * membership is incomplete or the counterparty profile can't be fetched.
 */
async function resolveDmPartner(
  channelId: string,
  myId: string
): Promise<EnrichedChannel['dmPartner']> {
  const members = await listChannelMembers(channelId);
  const other = members.find((m) => m.user_id !== myId);
  if (!other) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('id', other.user_id)
    .maybeSingle();
  return (data as EnrichedChannel['dmPartner']) || null;
}

function channelLabel(ch: EnrichedChannel): string {
  if (ch.type === 'direct') {
    return (
      ch.dmPartner?.full_name ||
      ch.dmPartner?.email?.split('@')[0] ||
      ch.name?.replace(/^dm-/, '').replace(/-/g, ' ') ||
      'Direct message'
    );
  }
  return `#${ch.name}`;
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
  muted,
  onPress,
}: {
  channel: EnrichedChannel;
  muted: boolean;
  onPress: () => void;
}) {
  const isDM = channel.type === 'direct';
  const isPrivate = channel.type === 'private';
  const title = channelLabel(channel);
  const preview =
    channel.lastMessage?.content?.trim() ||
    (channel.lastMessage?.attachments?.length
      ? channel.lastMessage.attachments[0].file_type === 'image'
        ? 'Sent an image'
        : channel.lastMessage.attachments[0].file_type === 'video'
          ? 'Sent a video'
          : 'Sent a file'
      : channel.description || 'No messages yet');
  const previewSender =
    channel.lastMessage?.sender?.full_name?.split(' ')[0] ||
    channel.lastMessage?.sender_name?.split(' ')[0];
  const previewLine = previewSender ? `${previewSender}: ${preview}` : preview;
  const ts = channel.lastMessage?.created_at ?? channel.created_at;
  const hasUnread = !muted && channel.unread > 0;

  return (
    <Card variant="flat" onPress={onPress} style={styles.row}>
      <View style={styles.rowInner}>
        <View style={styles.avatarSlot}>
          {isDM ? (
            <Avatar
              name={title}
              url={channel.dmPartner?.avatar_url ?? undefined}
              size="md"
            />
          ) : isPrivate ? (
            <View style={[styles.hashBadge, styles.privateBadge]}>
              <Lock size={18} color={colors.textSecondary} />
            </View>
          ) : (
            <View style={styles.hashBadge}>
              <Hash size={20} color={colors.emerald} />
            </View>
          )}
        </View>

        <View style={styles.rowMain}>
          <View style={styles.rowTopLine}>
            <Text
              style={[styles.rowTitle, hasUnread && styles.rowTitleUnread]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {muted && <VolumeX size={12} color={colors.textMuted} />}
            <Text style={styles.rowTs}>{formatMessageTime(ts)}</Text>
          </View>
          <View style={styles.rowBottomLine}>
            <Text
              style={[styles.rowPreview, hasUnread && styles.rowPreviewUnread]}
              numberOfLines={1}
            >
              {previewLine}
            </Text>
            {hasUnread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {channel.unread > 99 ? '99+' : channel.unread}
                </Text>
              </View>
            )}
          </View>
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
  privateBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  rowMain: {
    flex: 1,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  rowTitleUnread: {
    fontWeight: '700',
  },
  rowTs: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  rowPreview: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  rowPreviewUnread: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.textOnAccent ?? '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
