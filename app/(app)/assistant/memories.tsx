/**
 * Sage — Memories management.
 *
 * Lists long-lived facts Sage remembers about the user, grouped by kind.
 * Supports adding a new memory manually and deleting existing ones.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, Plus, Trash2, X } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  AssistantMemory,
  MEMORY_KINDS,
  MemoryKind,
  createMemory,
  deleteMemory,
  listMemories,
  memoryKindMeta,
} from '@/lib/assistantService';

export default function MemoriesScreen() {
  const router = useRouter();
  const [memories, setMemories] = useState<AssistantMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listMemories();
      setMemories(rows);
    } catch (e: any) {
      Alert.alert('Could not load memories', e?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<MemoryKind, AssistantMemory[]> = {
      preference: [],
      fact: [],
      goal: [],
      reminder: [],
      context: [],
    };
    memories.forEach((m) => {
      if (map[m.kind]) map[m.kind].push(m);
    });
    return map;
  }, [memories]);

  const handleDelete = (m: AssistantMemory) => {
    Alert.alert('Forget this memory?', `Sage will no longer remember "${m.title}".`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMemory(m.id);
            setMemories((prev) => prev.filter((x) => x.id !== m.id));
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
        <Header title="Memories" onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.emerald} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      <Header
        title="Memories"
        subtitle={`${memories.length} ${memories.length === 1 ? 'item' : 'items'}`}
        onBack={() => router.back()}
        trailing={
          <Pressable
            onPress={() => {
              haptics.tap();
              setSheetOpen(true);
            }}
            hitSlop={10}
            style={styles.headerBtn}
          >
            <Plus size={20} color={colors.emerald} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        {memories.length === 0 ? (
          <EmptyState
            icon={<Brain size={28} color={colors.textSecondary} />}
            title="No memories yet"
            description="Sage will save preferences, goals, and facts here as you chat. You can also add them manually."
            action={
              <Button
                label="Add memory"
                variant="primary"
                size="md"
                icon={<Plus size={16} color={colors.textOnAccent} />}
                onPress={() => setSheetOpen(true)}
              />
            }
          />
        ) : (
          MEMORY_KINDS.filter((k) => grouped[k.key].length > 0).map((k) => (
            <View key={k.key} style={{ marginBottom: spacing.lg }}>
              <View style={styles.sectionHeader}>
                <View style={[styles.kindDot, { backgroundColor: k.hex }]} />
                <Text style={styles.sectionTitle}>{k.label}</Text>
                <Text style={styles.sectionCount}>{grouped[k.key].length}</Text>
              </View>
              {grouped[k.key].map((m) => (
                <Card key={m.id} accent={k.hex} style={{ marginBottom: spacing.xs }}>
                  <View style={styles.memoryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memoryTitle}>{m.title}</Text>
                      <Text style={styles.memoryContent}>{m.content}</Text>
                      <View style={styles.memoryMeta}>
                        <Text style={styles.memoryMetaText}>
                          Importance {m.importance}/10
                        </Text>
                      </View>
                    </View>
                    <Pressable onPress={() => handleDelete(m)} hitSlop={10}>
                      <Trash2 size={16} color={colors.rose} />
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <AddMemorySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(m) => {
          setMemories((prev) => [m, ...prev]);
          setSheetOpen(false);
        }}
      />
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Add memory sheet
// ═══════════════════════════════════════════════════════════════════════

function AddMemorySheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (m: AssistantMemory) => void;
}) {
  const [kind, setKind] = useState<MemoryKind>('preference');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('preference');
      setTitle('');
      setContent('');
      setImportance(5);
    }
  }, [open]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Missing info', 'Give the memory a short title and content.');
      return;
    }
    try {
      setSaving(true);
      const m = await createMemory({ kind, title: title.trim(), content: content.trim(), importance });
      onCreated(m);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>New memory</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={styles.fieldLabel}>Kind</Text>
            <View style={styles.kindRow}>
              {MEMORY_KINDS.map((k) => {
                const active = kind === k.key;
                return (
                  <Pressable
                    key={k.key}
                    onPress={() => {
                      haptics.select();
                      setKind(k.key);
                    }}
                    style={[
                      styles.kindChip,
                      active && { backgroundColor: k.hex + '22', borderColor: k.hex },
                    ]}
                  >
                    <Text
                      style={[
                        styles.kindChipText,
                        active && { color: k.hex, fontWeight: '700' },
                      ]}
                    >
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Prefers short replies"
              placeholderTextColor={colors.textMuted}
              style={styles.field}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Content</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="The fact, preference, or goal to remember"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.field, { minHeight: 100, textAlignVertical: 'top' }]}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Importance: {importance}/10</Text>
            <View style={styles.importanceRow}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    haptics.select();
                    setImportance(n);
                  }}
                  style={[
                    styles.importanceDot,
                    n <= importance && { backgroundColor: memoryKindMeta(kind).hex },
                  ]}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Button label="Cancel" variant="secondary" size="md" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={saving ? 'Saving…' : 'Save memory'}
              variant="primary"
              size="md"
              loading={saving}
              onPress={handleSave}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.emerald + '1f',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  sectionCount: { ...typography.caption, color: colors.textMuted, marginLeft: 'auto' },

  memoryRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  memoryTitle: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' },
  memoryContent: { ...typography.body, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  memoryMeta: { marginTop: spacing.xs },
  memoryMetaText: { ...typography.micro, color: colors.textMuted },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface900,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { ...typography.h2, color: colors.textPrimary },
  sheetFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  field: {
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.body,
  },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  kindChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  importanceRow: { flexDirection: 'row', gap: 6 },
  importanceDot: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
