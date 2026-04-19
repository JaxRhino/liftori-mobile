/**
 * Tasks screen — filterable task list + quick-add + edit sheet.
 *
 * Layout:
 *   Header: My Tasks            +
 *   Filter chips: All · To do · In progress · Done
 *   Quick add input row
 *   Task list (grouped by status when filter = All)
 *
 * Tap a task → edit sheet. Long-press → quick toggle done. Swipe is
 * not in play yet (keeps the interaction simple for v1).
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
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  AdminTask,
  CreateTaskInput,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskPriority,
  TaskStatus,
  createTask,
  deleteTask,
  formatDueLabel,
  listTasks,
  priorityMeta,
  statusMeta,
  toggleTaskDone,
  updateTask,
} from '@/lib/tasksService';

type FilterKey = 'all' | 'todo' | 'in_progress' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

export default function TasksScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTask | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const rows = await listTasks({ includeDone: true, limit: 300 });
      setTasks(rows);
    } catch (err: any) {
      console.warn('[tasks] list failed', err);
      Alert.alert('Could not load tasks', err?.message ?? '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchTasks();
  }, [fetchTasks]);

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [filter, tasks]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, AdminTask[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const t of visible) {
      const bucket = (map[t.status] ??= []);
      bucket.push(t);
    }
    return map;
  }, [visible]);

  const openCreate = () => {
    haptics.bump();
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (task: AdminTask) => {
    haptics.tap();
    setEditing(task);
    setSheetOpen(true);
  };

  const handleToggle = async (task: AdminTask) => {
    haptics.select();
    // Optimistic toggle
    setTasks((cur) =>
      cur.map((t) =>
        t.id === task.id
          ? { ...t, status: t.status === 'done' ? 'todo' : 'done' }
          : t
      )
    );
    try {
      const next = await toggleTaskDone(task);
      setTasks((cur) => cur.map((t) => (t.id === next.id ? next : t)));
    } catch (err: any) {
      Alert.alert('Could not update', err?.message ?? '');
      void fetchTasks(); // rollback via refetch
    }
  };

  const handleQuickAdd = async () => {
    const val = quickAdd.trim();
    if (!val) return;
    setAdding(true);
    try {
      const next = await createTask({ title: val });
      setTasks((cur) => [next, ...cur]);
      setQuickAdd('');
      haptics.bump();
    } catch (err: any) {
      Alert.alert('Could not add', err?.message ?? '');
    } finally {
      setAdding(false);
    }
  };

  const handleSave = async (payload: CreateTaskInput) => {
    try {
      if (editing) {
        const next = await updateTask(editing.id, payload);
        setTasks((cur) => cur.map((t) => (t.id === next.id ? next : t)));
      } else {
        const next = await createTask(payload);
        setTasks((cur) => [next, ...cur]);
      }
      setSheetOpen(false);
      setEditing(null);
      haptics.bump();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? '');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete task?', 'This removes it permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(id);
            setTasks((cur) => cur.filter((t) => t.id !== id));
            setSheetOpen(false);
            setEditing(null);
            haptics.thud();
          } catch (err: any) {
            Alert.alert('Could not delete', err?.message ?? '');
          }
        },
      },
    ]);
  };

  const sections: { key: TaskStatus; label: string; rows: AdminTask[] }[] =
    filter === 'all'
      ? [
          { key: 'in_progress', label: 'In progress', rows: grouped.in_progress },
          { key: 'todo', label: 'To do', rows: grouped.todo },
          { key: 'done', label: 'Done', rows: grouped.done },
        ]
      : [
          {
            key: filter as TaskStatus,
            label: FILTERS.find((f) => f.key === filter)?.label ?? '',
            rows: visible,
          },
        ];

  const hasAny = visible.length > 0;

  return (
    <SafeScreen
      bottom="skip"
      scroll
      onRefresh={async () => {
        setRefreshing(true);
        await fetchTasks();
      }}
      refreshing={refreshing}
    >
      <Header
        title="Tasks"
        onBack={() => router.back()}
        trailing={
          <Pressable
            onPress={openCreate}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            accessibilityLabel="New task"
          >
            <Plus size={22} color={colors.emerald} />
          </Pressable>
        }
      />

      <View style={styles.body}>
        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  haptics.select();
                  setFilter(f.key);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Quick add */}
        <View style={styles.quickAdd}>
          <TextInput
            style={styles.quickInput}
            value={quickAdd}
            onChangeText={setQuickAdd}
            placeholder="Add a quick task…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleQuickAdd}
          />
          <Pressable
            onPress={handleQuickAdd}
            disabled={!quickAdd.trim() || adding}
            style={({ pressed }) => [
              styles.quickAddBtn,
              pressed && styles.pressed,
              !quickAdd.trim() && { opacity: 0.4 },
            ]}
            accessibilityLabel="Add task"
          >
            {adding ? (
              <ActivityIndicator size="small" color={colors.textOnAccent} />
            ) : (
              <Plus size={18} color={colors.textOnAccent} />
            )}
          </Pressable>
        </View>

        {loading && tasks.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.emerald} />
          </View>
        ) : !hasAny ? (
          <EmptyState
            icon={<ListTodo size={28} color={colors.textSecondary} />}
            title="Nothing here"
            description="Add your first task above, or tap + in the header."
          />
        ) : (
          sections.map((section) => {
            if (section.rows.length === 0) return null;
            return (
              <View key={section.key} style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {section.label}{' '}
                  <Text style={styles.sectionCount}>· {section.rows.length}</Text>
                </Text>
                <View style={{ gap: spacing.xs }}>
                  {section.rows.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onPress={() => openEdit(t)}
                      onToggle={() => handleToggle(t)}
                    />
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      <TaskSheet
        open={sheetOpen}
        editing={editing}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        onDelete={editing ? () => handleDelete(editing.id) : undefined}
      />
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Task row
// ═══════════════════════════════════════════════════════════════════════

function TaskRow({
  task,
  onPress,
  onToggle,
}: {
  task: AdminTask;
  onPress: () => void;
  onToggle: () => void;
}) {
  const pMeta = priorityMeta(task.priority);
  const sMeta = statusMeta(task.status);
  const due = formatDueLabel(task.due_date);
  const done = task.status === 'done';

  return (
    <Card variant="flat" accent={pMeta.color} onPress={onPress}>
      <View style={styles.taskRow}>
        <Pressable
          onPress={onToggle}
          hitSlop={10}
          style={styles.taskCheckBtn}
          accessibilityLabel={done ? 'Mark as not done' : 'Mark as done'}
        >
          {done ? (
            <CheckCircle2 size={22} color={colors.emerald} />
          ) : (
            <Circle size={22} color={colors.textMuted} />
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.taskTitle, done && styles.taskTitleDone]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { borderColor: sMeta.color }]}>
              <Text style={[styles.metaPillText, { color: sMeta.color }]}>
                {sMeta.label}
              </Text>
            </View>
            <Text style={[styles.metaSep, { color: pMeta.color }]}>·</Text>
            <Text style={[styles.metaPriority, { color: pMeta.color }]}>
              {pMeta.label}
            </Text>
            {task.due_date ? (
              <>
                <Text style={styles.metaSep}>·</Text>
                <View style={styles.dueWrap}>
                  <Clock
                    size={11}
                    color={
                      due.overdue
                        ? colors.rose
                        : due.soon
                          ? colors.amber
                          : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.metaDue,
                      due.overdue && { color: colors.rose },
                      due.soon && !due.overdue && { color: colors.amber },
                    ]}
                  >
                    {due.label}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Task sheet
// ═══════════════════════════════════════════════════════════════════════

interface SheetProps {
  open: boolean;
  editing: AdminTask | null;
  onClose: () => void;
  onSave: (payload: CreateTaskInput) => void | Promise<void>;
  onDelete?: () => void;
}

function TaskSheet({ open, editing, onClose, onSave, onDelete }: SheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setStatus(editing.status);
      setPriority(editing.priority);
      setDueDate(editing.due_date ?? '');
    } else {
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('medium');
      setDueDate('');
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title', 'Every task needs a title.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title,
        description,
        status,
        priority,
        due_date: dueDate.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {editing ? 'Edit task' : 'New task'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sheetLabel}>Title</Text>
          <TextInput
            style={styles.sheetInput}
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to happen?"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Description</Text>
          <TextInput
            style={[styles.sheetInput, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional notes, context, or links"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={styles.sheetLabel}>Status</Text>
          <View style={styles.optionRow}>
            {TASK_STATUSES.map((s) => {
              const active = status === s.key;
              const meta = statusMeta(s.key);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => {
                    haptics.select();
                    setStatus(s.key);
                  }}
                  style={[
                    styles.optionPill,
                    active && { borderColor: meta.color, backgroundColor: meta.color + '22' },
                  ]}
                >
                  {active ? <Check size={14} color={meta.color} /> : null}
                  <Text
                    style={[
                      styles.optionText,
                      active && { color: meta.color, fontWeight: '700' },
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Priority</Text>
          <View style={styles.optionRow}>
            {TASK_PRIORITIES.map((p) => {
              const active = priority === p.key;
              const meta = priorityMeta(p.key);
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    haptics.select();
                    setPriority(p.key);
                  }}
                  style={[
                    styles.optionPill,
                    active && { borderColor: meta.color, backgroundColor: meta.color + '22' },
                  ]}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: meta.color },
                    ]}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      active && { color: meta.color, fontWeight: '700' },
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetLabel}>Due date</Text>
          <TextInput
            style={styles.sheetInput}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD (optional)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </ScrollView>

        <View style={styles.sheetActions}>
          {onDelete ? (
            <Button
              label="Delete"
              variant="destructive"
              size="md"
              icon={<Trash2 size={16} color={colors.textOnAccent} />}
              onPress={onDelete}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button
            label={editing ? 'Save' : 'Create'}
            variant="primary"
            size="md"
            onPress={handleSave}
            loading={saving}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },

  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.emerald + '22',
    borderColor: colors.emerald,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.emerald,
  },

  quickAdd: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickInput: {
    flex: 1,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  quickAddBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingBlock: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },

  section: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  sectionCount: {
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Task row
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  taskCheckBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  taskTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  taskTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  metaPillText: {
    ...typography.micro,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  metaPriority: {
    ...typography.micro,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaSep: {
    color: colors.textMuted,
    ...typography.caption,
    marginHorizontal: 2,
  },
  dueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaDue: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
    backgroundColor: colors.surface900,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface700,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  sheetLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sheetInput: {
    backgroundColor: colors.surface800,
    color: colors.textPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface800,
  },
  optionText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
