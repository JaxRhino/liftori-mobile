/**
 * Notes screen — sticky-note grid + editor sheet.
 *
 * Layout:
 *   Header: Notes                 +
 *   Search row (optional pinned filter toggle)
 *   2-column grid of colored note cards
 *
 * Tap a note → edit sheet. Pin toggle lives both on the card (top-right
 * chip) and inside the editor. Color picker sits at the bottom of the
 * editor.
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
  NotebookPen,
  Palette,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  AdminNote,
  CreateNoteInput,
  NoteColor,
  NOTE_COLORS,
  createNote,
  deleteNote,
  formatUpdatedLabel,
  listNotes,
  noteColorMeta,
  previewBody,
  togglePinned,
  updateNote,
} from '@/lib/notesService';

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNote | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const rows = await listNotes({ limit: 300 });
      setNotes(rows);
    } catch (err: any) {
      console.warn('[notes] list failed', err);
      Alert.alert('Could not load notes', err?.message ?? '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchNotes();
  }, [fetchNotes]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (pinnedOnly && !n.pinned) return false;
      if (!q) return true;
      const hay =
        n.title.toLowerCase() +
        ' ' +
        (n.body ?? '').toLowerCase() +
        ' ' +
        (n.tags ?? []).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [notes, search, pinnedOnly]);

  const openCreate = () => {
    haptics.bump();
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (note: AdminNote) => {
    haptics.tap();
    setEditing(note);
    setSheetOpen(true);
  };

  const handleTogglePin = async (note: AdminNote) => {
    haptics.select();
    // Optimistic
    setNotes((cur) =>
      cur.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n))
    );
    try {
      const next = await togglePinned(note);
      setNotes((cur) => cur.map((n) => (n.id === next.id ? next : n)));
    } catch (err: any) {
      Alert.alert('Could not update', err?.message ?? '');
      void fetchNotes();
    }
  };

  const handleSave = async (payload: CreateNoteInput) => {
    try {
      if (editing) {
        const next = await updateNote(editing.id, payload);
        setNotes((cur) => cur.map((n) => (n.id === next.id ? next : n)));
      } else {
        const next = await createNote(payload);
        setNotes((cur) => [next, ...cur]);
      }
      setSheetOpen(false);
      setEditing(null);
      haptics.bump();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? '');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete note?', 'This removes it permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote(id);
            setNotes((cur) => cur.filter((n) => n.id !== id));
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

  // Split into two balanced columns so cards of varying heights still
  // tile cleanly (masonry-ish without a third-party dep).
  const [colA, colB] = useMemo(() => {
    const a: AdminNote[] = [];
    const b: AdminNote[] = [];
    let aH = 0;
    let bH = 0;
    for (const n of visible) {
      // crude height estimate: title(24) + body preview (proportional)
      const est =
        60 + Math.min(300, (n.body ?? '').length * 0.6) + n.tags.length * 12;
      if (aH <= bH) {
        a.push(n);
        aH += est;
      } else {
        b.push(n);
        bH += est;
      }
    }
    return [a, b];
  }, [visible]);

  return (
    <SafeScreen
      bottom="skip"
      scroll
      onRefresh={async () => {
        setRefreshing(true);
        await fetchNotes();
      }}
      refreshing={refreshing}
    >
      <Header
        title="Notes"
        onBack={() => router.back()}
        trailing={
          <Pressable
            onPress={openCreate}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            accessibilityLabel="New note"
          >
            <Plus size={22} color={colors.emerald} />
          </Pressable>
        }
      />

      <View style={styles.body}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search notes"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={10}
                style={styles.pressed}
              >
                <X size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              haptics.select();
              setPinnedOnly((v) => !v);
            }}
            style={[
              styles.pinFilterBtn,
              pinnedOnly && styles.pinFilterActive,
            ]}
            accessibilityLabel={
              pinnedOnly ? 'Show all notes' : 'Show pinned only'
            }
          >
            <Pin
              size={16}
              color={pinnedOnly ? colors.amber : colors.textSecondary}
              fill={pinnedOnly ? colors.amber : 'transparent'}
            />
          </Pressable>
        </View>

        {loading && notes.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.emerald} />
          </View>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<NotebookPen size={28} color={colors.textSecondary} />}
            title={search || pinnedOnly ? 'No matches' : 'No notes yet'}
            description={
              search || pinnedOnly
                ? 'Try a different filter or search.'
                : 'Capture quick thoughts, drafts, or ideas.'
            }
            action={
              !search && !pinnedOnly ? (
                <Button
                  label="New note"
                  size="sm"
                  variant="primary"
                  icon={<Plus size={16} color={colors.textOnAccent} />}
                  onPress={openCreate}
                />
              ) : undefined
            }
          />
        ) : (
          <View style={styles.gridRow}>
            <View style={styles.column}>
              {colA.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  onPress={() => openEdit(n)}
                  onTogglePin={() => handleTogglePin(n)}
                />
              ))}
            </View>
            <View style={styles.column}>
              {colB.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  onPress={() => openEdit(n)}
                  onTogglePin={() => handleTogglePin(n)}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <NoteSheet
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
// Note card
// ═══════════════════════════════════════════════════════════════════════

function NoteCard({
  note,
  onPress,
  onTogglePin,
}: {
  note: AdminNote;
  onPress: () => void;
  onTogglePin: () => void;
}) {
  const { surface, accent } = noteColorMeta(note.color);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: surface, borderColor: accent + '33' },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {note.title}
        </Text>
        <Pressable
          onPress={onTogglePin}
          hitSlop={10}
          style={styles.cardPinBtn}
        >
          {note.pinned ? (
            <Pin size={14} color={colors.amber} fill={colors.amber} />
          ) : (
            <PinOff size={14} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
      {note.body ? (
        <Text style={styles.cardBody} numberOfLines={6}>
          {previewBody(note.body)}
        </Text>
      ) : null}
      {note.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {note.tags.slice(0, 3).map((t) => (
            <View key={t} style={[styles.tag, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
              <Text style={[styles.tagText, { color: accent }]}>#{t}</Text>
            </View>
          ))}
          {note.tags.length > 3 ? (
            <Text style={styles.tagMore}>+{note.tags.length - 3}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.cardFoot}>
        {formatUpdatedLabel(note.updated_at ?? note.created_at)}
      </Text>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Note sheet (editor)
// ═══════════════════════════════════════════════════════════════════════

interface SheetProps {
  open: boolean;
  editing: AdminNote | null;
  onClose: () => void;
  onSave: (payload: CreateNoteInput) => void | Promise<void>;
  onDelete?: () => void;
}

function NoteSheet({ open, editing, onClose, onSave, onDelete }: SheetProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [pinned, setPinned] = useState(false);
  const [color, setColor] = useState<NoteColor>('default');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setBody(editing.body ?? '');
      setTagsText((editing.tags ?? []).join(', '));
      setPinned(editing.pinned);
      setColor(editing.color ?? 'default');
    } else {
      setTitle('');
      setBody('');
      setTagsText('');
      setPinned(false);
      setColor('default');
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!title.trim() && !body.trim()) {
      Alert.alert('Empty note', 'Add a title or body before saving.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim() || 'Untitled',
        body: body.trim() || null,
        tags: tagsText
          .split(/[,\s]+/)
          .map((t) => t.replace(/^#/, ''))
          .filter(Boolean),
        pinned,
        color,
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
            {editing ? 'Edit note' : 'New note'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textMuted}
          />

          <TextInput
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Start writing…"
            placeholderTextColor={colors.textMuted}
            multiline
            scrollEnabled={false}
          />

          <Text style={styles.sheetLabel}>Tags</Text>
          <TextInput
            style={styles.sheetInput}
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="ideas, launch, research"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.helperText}>
            Separate with commas or spaces. "#" symbols are optional.
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelWrap}>
              <Pin size={14} color={colors.amber} />
              <Text style={styles.sheetLabel}>Pin to top</Text>
            </View>
            <Pressable
              onPress={() => {
                haptics.select();
                setPinned((v) => !v);
              }}
              style={[
                styles.toggle,
                pinned && { backgroundColor: colors.amber },
              ]}
            >
              <View
                style={[styles.toggleKnob, pinned && { marginLeft: 20 }]}
              />
            </Pressable>
          </View>

          <View style={styles.paletteLabelRow}>
            <Palette size={14} color={colors.textSecondary} />
            <Text style={styles.sheetLabel}>Color</Text>
          </View>
          <View style={styles.colorRow}>
            {NOTE_COLORS.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => {
                  haptics.select();
                  setColor(c.key);
                }}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c.surface, borderColor: c.accent },
                  color === c.key && styles.colorSwatchSelected,
                ]}
                accessibilityLabel={c.label}
              >
                <View
                  style={[styles.colorInnerDot, { backgroundColor: c.accent }]}
                />
              </Pressable>
            ))}
          </View>
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

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  pinFilterBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinFilterActive: {
    borderColor: colors.amber,
    backgroundColor: colors.amber + '22',
  },

  loadingBlock: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },

  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  column: {
    flex: 1,
    gap: spacing.md,
  },

  card: {
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    minHeight: 96,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  cardPinBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  cardFoot: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.xs,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  tagText: {
    ...typography.micro,
    fontWeight: '700',
  },
  tagMore: {
    ...typography.micro,
    color: colors.textMuted,
    alignSelf: 'center',
    marginLeft: 2,
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
    marginBottom: spacing.sm,
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
  titleInput: {
    ...typography.h1,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  bodyInput: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 180,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  helperText: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  toggleLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface700,
    padding: 2,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textPrimary,
  },
  paletteLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.1 }],
  },
  colorInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
