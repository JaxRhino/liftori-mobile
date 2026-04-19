/**
 * Sage — AI Assistant home.
 *
 * Shows:
 *   - Quick "Ask Sage" hero CTA — tapping starts a new conversation
 *   - Suggested prompts grid (one-tap common actions)
 *   - Recent threads list (pinned first, then by updated_at)
 *   - Tail action rows to open Memories and Settings
 *
 * Tapping a thread routes to `/assistant/[threadId]`. The detail screen
 * handles the actual chat UI + message sending.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Archive,
  Brain,
  Calendar as CalendarIcon,
  ChevronRight,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  Pin,
  PinOff,
  Plus,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  AssistantThread,
  archiveThread,
  createThread,
  deleteThread,
  formatRelativeTime,
  listThreads,
  togglePinThread,
} from '@/lib/assistantService';

const SUGGESTED: {
  title: string;
  subtitle: string;
  prompt: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    title: 'Schedule something',
    subtitle: 'Add it to your calendar',
    prompt: 'Schedule a 1-hour focus block tomorrow at 9 AM to work on the Liftori build.',
    icon: <CalendarIcon size={16} color={colors.sky} />,
    color: colors.sky,
  },
  {
    title: 'Add a task',
    subtitle: 'Capture a to-do',
    prompt: 'Remind me to follow up with Mike on the ZenBusiness partnership this week.',
    icon: <ListTodo size={16} color={colors.emerald} />,
    color: colors.emerald,
  },
  {
    title: 'Capture a note',
    subtitle: 'Quick brain dump',
    prompt: 'Jot down a note: "Liftori AI infra roadmap — Phase 1 Claude API, Phase 2 cloud GPU."',
    icon: <StickyNote size={16} color={colors.amber} />,
    color: colors.amber,
  },
  {
    title: 'Log a sales lead',
    subtitle: 'New prospect into the pipeline',
    prompt: 'Add a new sales lead: Growth-tier prospect "Acme Corp" — contact Jane Doe.',
    icon: <Users size={16} color={colors.indigo} />,
    color: colors.indigo,
  },
];

export default function AssistantIndexScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listThreads();
      setThreads(rows);
    } catch (e: any) {
      Alert.alert('Could not load threads', e?.message ?? '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const pinned = useMemo(() => threads.filter((t) => t.pinned), [threads]);
  const rest = useMemo(() => threads.filter((t) => !t.pinned), [threads]);

  const handleNew = async () => {
    try {
      setStarting(true);
      haptics.bump();
      const t = await createThread('New conversation');
      router.push(`/assistant/${t.id}` as any);
    } catch (e: any) {
      Alert.alert('Could not start thread', e?.message ?? '');
    } finally {
      setStarting(false);
    }
  };

  const openThreadWithPrompt = async (prompt: string) => {
    try {
      haptics.tap();
      const t = await createThread(prompt.slice(0, 60));
      router.push({ pathname: '/assistant/[threadId]', params: { threadId: t.id, prompt } } as any);
    } catch (e: any) {
      Alert.alert('Could not start thread', e?.message ?? '');
    }
  };

  const handlePin = async (t: AssistantThread) => {
    try {
      haptics.select();
      await togglePinThread(t.id, !t.pinned);
      void load();
    } catch (e: any) {
      Alert.alert('Could not update', e?.message ?? '');
    }
  };

  const handleArchive = async (t: AssistantThread) => {
    try {
      haptics.thud();
      await archiveThread(t.id);
      setThreads((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: any) {
      Alert.alert('Could not archive', e?.message ?? '');
    }
  };

  const handleDelete = (t: AssistantThread) => {
    Alert.alert('Delete thread?', `Permanently remove "${t.title}" and its messages.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteThread(t.id);
            setThreads((prev) => prev.filter((x) => x.id !== t.id));
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? '');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeScreen>
        <Header title="Sage" onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.emerald} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      <Header
        title="Sage"
        subtitle="Your personal AI assistant"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Hero */}
        <Card accent={colors.emerald} style={{ marginBottom: spacing.lg }}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Sparkles size={22} color={colors.emerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Ask Sage anything</Text>
              <Text style={styles.heroSub}>
                Schedule, capture, plan, or search — Sage can act on your calendar, tasks, notes, leads, and CRM.
              </Text>
            </View>
          </View>
          <Button
            label={starting ? 'Starting…' : 'Start new conversation'}
            variant="primary"
            size="md"
            icon={<Plus size={16} color={colors.textOnAccent} />}
            loading={starting}
            onPress={handleNew}
            style={{ marginTop: spacing.md }}
            fullWidth
          />
        </Card>

        {/* Suggested prompts */}
        <Text style={styles.sectionLabel}>Suggested</Text>
        <View style={styles.suggestGrid}>
          {SUGGESTED.map((s) => (
            <Pressable
              key={s.title}
              onPress={() => openThreadWithPrompt(s.prompt)}
              style={({ pressed }) => [
                styles.suggestCard,
                { borderColor: s.color + '55' },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.suggestIcon, { backgroundColor: s.color + '1f' }]}>
                {s.icon}
              </View>
              <Text style={styles.suggestTitle} numberOfLines={2}>{s.title}</Text>
              <Text style={styles.suggestSub} numberOfLines={2}>{s.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        {/* Threads */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Conversations</Text>
        {threads.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare size={28} color={colors.textSecondary} />}
            title="No conversations yet"
            description="Ask Sage something to get started."
            action={
              <Button
                label="Start conversation"
                variant="primary"
                size="md"
                icon={<Send size={16} color={colors.textOnAccent} />}
                onPress={handleNew}
              />
            }
          />
        ) : (
          <>
            {pinned.length > 0 ? (
              <>
                {pinned.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    onOpen={() => {
                      haptics.tap();
                      router.push(`/assistant/${t.id}` as any);
                    }}
                    onPin={() => handlePin(t)}
                    onArchive={() => handleArchive(t)}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
                <View style={{ height: spacing.sm }} />
              </>
            ) : null}
            {rest.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                onOpen={() => {
                  haptics.tap();
                  router.push(`/assistant/${t.id}` as any);
                }}
                onPin={() => handlePin(t)}
                onArchive={() => handleArchive(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </>
        )}

        {/* Footer actions */}
        <View style={{ marginTop: spacing.lg }}>
          <Card
            variant="flat"
            onPress={() => {
              haptics.tap();
              router.push('/assistant/memories' as any);
            }}
            style={{ marginBottom: spacing.xs }}
          >
            <View style={styles.footerRow}>
              <View style={[styles.footerIcon, { backgroundColor: colors.purple + '1f' }]}>
                <Brain size={18} color={colors.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.footerTitle}>Memories</Text>
                <Text style={styles.footerSub}>What Sage remembers about you</Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Thread row
// ═══════════════════════════════════════════════════════════════════════

function ThreadRow({
  thread,
  onOpen,
  onPin,
  onArchive,
  onDelete,
}: {
  thread: AssistantThread;
  onOpen: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      onPress={onOpen}
      accent={thread.pinned ? colors.amber : undefined}
      style={{ marginBottom: spacing.xs }}
    >
      <View style={styles.rowTop}>
        <View
          style={[
            styles.rowIcon,
            {
              backgroundColor: (thread.pinned ? colors.amber : colors.emerald) + '1f',
              borderColor: thread.pinned ? colors.amber : colors.emerald,
            },
          ]}
        >
          <MessageCircle
            size={18}
            color={thread.pinned ? colors.amber : colors.emerald}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {thread.title}
          </Text>
          {thread.last_message_preview ? (
            <Text style={styles.rowPreview} numberOfLines={2}>
              {thread.last_message_preview}
            </Text>
          ) : null}
          <View style={styles.rowMeta}>
            <Text style={styles.rowMetaText}>
              {thread.message_count} message{thread.message_count === 1 ? '' : 's'}
            </Text>
            <Text style={styles.rowMetaText}>·</Text>
            <Text style={styles.rowMetaText}>{formatRelativeTime(thread.updated_at)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.rowActions}>
        <Pressable onPress={onPin} hitSlop={10} style={styles.rowAction}>
          {thread.pinned ? (
            <PinOff size={14} color={colors.textSecondary} />
          ) : (
            <Pin size={14} color={colors.textSecondary} />
          )}
          <Text style={styles.rowActionText}>{thread.pinned ? 'Unpin' : 'Pin'}</Text>
        </Pressable>
        <Pressable onPress={onArchive} hitSlop={10} style={styles.rowAction}>
          <Archive size={14} color={colors.textSecondary} />
          <Text style={styles.rowActionText}>Archive</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={10} style={styles.rowAction}>
          <Trash2 size={14} color={colors.rose} />
          <Text style={[styles.rowActionText, { color: colors.rose }]}>Delete</Text>
        </Pressable>
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  pressed: { opacity: 0.6 },

  heroRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.emerald + '1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { ...typography.h2, color: colors.textPrimary },
  heroSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },

  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  suggestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 92,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 6,
  },
  suggestIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  suggestTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  suggestSub: {
    ...typography.micro,
    color: colors.textSecondary,
  },

  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  rowTitle: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' },
  rowPreview: { ...typography.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  rowMeta: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  rowMetaText: { ...typography.caption, color: colors.textMuted },

  rowActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowActionText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTitle: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' },
  footerSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
