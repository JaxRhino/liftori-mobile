/**
 * Sage — AI Assistant conversation detail.
 *
 * Chat-style UI:
 *   - Message list (user on right, Sage on left) with tool-use chips under each
 *     assistant turn so you can see what got created (event/task/note/lead).
 *   - Composer row at the bottom with send button.
 *   - KeyboardAvoidingView so the input stays visible when the keyboard opens.
 *
 * The composer calls `sendMessage(threadId, text)` which hits the edge
 * function `assistant-chat`. That function writes both the user message
 * and Sage's reply into `assistant_messages`, so after the round-trip we
 * just re-fetch the message list to render both.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowUp,
  Brain,
  Calendar as CalendarIcon,
  ListTodo,
  Search,
  Sparkles,
  StickyNote,
  Users,
  Wrench,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  AssistantMessage,
  AssistantToolCall,
  fetchThread,
  listMessages,
  sendMessage,
  toolLabel,
} from '@/lib/assistantService';

export default function AssistantThreadScreen() {
  const { threadId, prompt } = useLocalSearchParams<{ threadId: string; prompt?: string }>();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [title, setTitle] = useState('Conversation');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const autoSentRef = useRef(false);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const [t, msgs] = await Promise.all([fetchThread(threadId), listMessages(threadId)]);
      if (t) setTitle(t.title);
      setMessages(msgs);
    } catch (e: any) {
      Alert.alert('Could not load', e?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // If opened with a seed `prompt` param from the home screen, send it once.
  useEffect(() => {
    if (loading) return;
    if (!prompt || autoSentRef.current) return;
    if (messages.length > 0) {
      // thread already has content, don't double-send
      autoSentRef.current = true;
      return;
    }
    autoSentRef.current = true;
    void doSend(String(prompt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, prompt, messages.length]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length, sending]);

  const doSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !threadId) return;
    try {
      setSending(true);
      haptics.bump();

      // Optimistic user bubble
      const optimistic: AssistantMessage = {
        id: `optimistic-${Date.now()}`,
        thread_id: threadId,
        user_id: '',
        role: 'user',
        content: trimmed,
        tool_calls: null,
        tool_results: null,
        model: null,
        tokens_in: null,
        tokens_out: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput('');

      await sendMessage(threadId, trimmed);
      // Refetch to get persisted user + assistant messages with correct IDs
      const msgs = await listMessages(threadId);
      setMessages(msgs);
    } catch (e: any) {
      Alert.alert('Message failed', e?.message ?? 'Could not reach Sage. Try again.');
      // Reload to drop the optimistic entry
      void load();
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    void doSend(input);
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
    <SafeScreen bottom="skip">
      <Header
        title={title}
        subtitle="Sage"
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.listBody}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.introWrap}>
              <View style={styles.introIcon}>
                <Sparkles size={22} color={colors.emerald} />
              </View>
              <Text style={styles.introTitle}>How can I help?</Text>
              <Text style={styles.introBody}>
                Ask me to schedule something, capture an idea, add a task, or look something up. I can act on your Liftori data.
              </Text>
            </View>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} msg={m} />)
          )}
          {sending ? <TypingBubble /> : null}
        </ScrollView>

        <View style={styles.composerWrap}>
          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask Sage…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.input}
              editable={!sending}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable
              disabled={!input.trim() || sending}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.textOnAccent} />
              ) : (
                <ArrowUp size={18} color={colors.textOnAccent} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Bubble
// ═══════════════════════════════════════════════════════════════════════

function MessageBubble({ msg }: { msg: AssistantMessage }) {
  if (msg.role === 'user') {
    return (
      <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText}>{msg.content}</Text>
        </View>
      </View>
    );
  }

  // assistant
  return (
    <View style={styles.bubbleRow}>
      <View style={[styles.bubble, styles.assistantBubble]}>
        {msg.content ? (
          <Text style={styles.assistantText}>{msg.content}</Text>
        ) : (
          <Text style={[styles.assistantText, { fontStyle: 'italic', color: colors.textSecondary }]}>
            (no response)
          </Text>
        )}
        {Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0 ? (
          <View style={styles.toolRow}>
            {msg.tool_calls.map((tc, i) => (
              <ToolChip key={i} tool={tc} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ToolChip({ tool }: { tool: AssistantToolCall }) {
  const icon = toolIcon(tool.name);
  const preview = toolPreview(tool);
  return (
    <View style={styles.toolChip}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.toolLabel}>{toolLabel(tool.name)}</Text>
        {preview ? <Text style={styles.toolPreview}>{preview}</Text> : null}
      </View>
    </View>
  );
}

function toolIcon(name: string) {
  const size = 14;
  switch (name) {
    case 'create_calendar_event': return <CalendarIcon size={size} color={colors.sky} />;
    case 'create_task': return <ListTodo size={size} color={colors.emerald} />;
    case 'create_note': return <StickyNote size={size} color={colors.amber} />;
    case 'create_sales_lead': return <Users size={size} color={colors.indigo} />;
    case 'log_customer_activity': return <Users size={size} color={colors.indigo} />;
    case 'save_memory': return <Brain size={size} color={colors.purple} />;
    case 'search_customers':
    case 'search_sales_leads':
      return <Search size={size} color={colors.textSecondary} />;
    default: return <Wrench size={size} color={colors.textSecondary} />;
  }
}

function toolPreview(tool: AssistantToolCall): string | null {
  const { name, input } = tool;
  if (!input) return null;
  switch (name) {
    case 'create_calendar_event':
      return `${input.title} · ${input.start_date}${input.start_time ? ' ' + input.start_time : ''}`;
    case 'create_task':
      return `${input.title}${input.due_date ? ' · due ' + input.due_date : ''}`;
    case 'create_note':
      return input.title;
    case 'create_sales_lead':
      return `${input.title}${input.company_name ? ' · ' + input.company_name : ''}`;
    case 'log_customer_activity':
      return `${input.type} — ${input.title}`;
    case 'save_memory':
      return `${input.kind}: ${input.title}`;
    case 'search_customers':
    case 'search_sales_leads':
      return `"${input.query}"`;
    default: return null;
  }
}

function TypingBubble() {
  return (
    <View style={styles.bubbleRow}>
      <View style={[styles.bubble, styles.assistantBubble, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <ActivityIndicator size="small" color={colors.emerald} />
        <Text style={[styles.assistantText, { color: colors.textSecondary }]}>Sage is thinking…</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listBody: {
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },

  introWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.emerald + '1f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.sm },
  introBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },

  bubbleRow: { flexDirection: 'row', marginBottom: spacing.xs },
  bubble: {
    maxWidth: '85%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.emerald,
    borderBottomRightRadius: radii.sm,
  },
  userText: { ...typography.body, color: colors.textOnAccent, lineHeight: 22 },
  assistantBubble: {
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radii.sm,
  },
  assistantText: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },

  toolRow: {
    marginTop: spacing.sm,
    gap: 6,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface900,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  toolLabel: { ...typography.micro, color: colors.textPrimary, fontWeight: '700' },
  toolPreview: { ...typography.micro, color: colors.textSecondary, marginTop: 1 },

  composerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface900,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    maxHeight: 120,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surface900,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
