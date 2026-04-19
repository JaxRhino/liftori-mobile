/**
 * Calendar screen — month grid + agenda list.
 *
 * Layout:
 *   Header: ← Month Year →           + new
 *   ─ weekday row (S M T W T F S)
 *   ┌ 6×7 day grid with event dots ┐
 *   └──────────────────────────────┘
 *   Agenda list for selected date
 *
 * New / Edit event uses a bottom-sheet Modal. Event color is rendered
 * as a left accent bar on each agenda row (matches Card `accent` API).
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
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
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
  CalendarEvent,
  CreateEventInput,
  EventColor,
  EVENT_COLORS,
  buildMonthGrid,
  createEvent,
  deleteEvent,
  eventColorHex,
  firstOfMonth,
  formatDayLabel,
  formatTimeLabel,
  groupEventsByDate,
  lastOfMonth,
  listEventsInRange,
  monthLabel,
  parseDateKey,
  toDateKey,
  updateEvent,
} from '@/lib/calendarService';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarScreen() {
  const router = useRouter();
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(() => toDateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const groups = useMemo(() => groupEventsByDate(events), [events]);
  const selectedEvents = groups[selected] ?? [];

  const fetchEvents = useCallback(async () => {
    try {
      // Fetch a generous window around the month so day selection
      // outside the anchor still shows events.
      const start = new Date(monthAnchor);
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(monthAnchor);
      end.setMonth(end.getMonth() + 2);
      end.setDate(0);
      const rows = await listEventsInRange({
        rangeStart: toDateKey(firstOfMonth(start)),
        rangeEnd: toDateKey(lastOfMonth(end)),
        limit: 500,
      });
      setEvents(rows);
    } catch (err) {
      console.warn('[calendar] fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [monthAnchor]);

  useEffect(() => {
    setLoading(true);
    void fetchEvents();
  }, [fetchEvents]);

  const goPrevMonth = () => {
    haptics.tap();
    const next = new Date(monthAnchor);
    next.setMonth(next.getMonth() - 1);
    setMonthAnchor(next);
  };
  const goNextMonth = () => {
    haptics.tap();
    const next = new Date(monthAnchor);
    next.setMonth(next.getMonth() + 1);
    setMonthAnchor(next);
  };
  const goToday = () => {
    haptics.tap();
    const today = new Date();
    setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(toDateKey(today));
  };

  const openCreate = () => {
    haptics.bump();
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    haptics.tap();
    setEditing(event);
    setSheetOpen(true);
  };

  const handleSaveEvent = async (payload: CreateEventInput) => {
    try {
      if (editing) {
        const next = await updateEvent(editing.id, payload);
        setEvents((cur) => cur.map((e) => (e.id === next.id ? next : e)));
      } else {
        const next = await createEvent(payload);
        setEvents((cur) => [...cur, next]);
      }
      setSheetOpen(false);
      setEditing(null);
      haptics.bump();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Try again in a moment.');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete event?', 'This removes it from your calendar.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEvent(id);
            setEvents((cur) => cur.filter((e) => e.id !== id));
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

  const todayKey = toDateKey(new Date());

  return (
    <SafeScreen bottom="skip">
      <Header
        title={monthLabel(monthAnchor)}
        onBack={() => router.back()}
        trailing={
          <Pressable
            onPress={openCreate}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            accessibilityLabel="New event"
          >
            <Plus size={22} color={colors.emerald} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Month nav row */}
        <View style={styles.monthNav}>
          <Pressable onPress={goPrevMonth} hitSlop={12} style={styles.navBtn}>
            <ChevronLeft size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={goToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>Today</Text>
          </Pressable>
          <Pressable onPress={goNextMonth} hitSlop={12} style={styles.navBtn}>
            <ChevronRight size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Weekdays */}
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((d, i) => (
            <Text key={`${d}-${i}`} style={styles.weekdayText}>
              {d}
            </Text>
          ))}
        </View>

        {/* Month grid */}
        <View style={styles.grid}>
          {grid.map((key) => {
            const date = parseDateKey(key);
            const inMonth = date.getMonth() === monthAnchor.getMonth();
            const isSelected = key === selected;
            const isToday = key === todayKey;
            const dayEvents = groups[key] ?? [];
            const dots = dayEvents.slice(0, 3);
            return (
              <Pressable
                key={key}
                onPress={() => {
                  haptics.select();
                  setSelected(key);
                }}
                style={({ pressed }) => [
                  styles.dayCell,
                  isSelected && styles.daySelected,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel={formatDayLabel(key)}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !inMonth && styles.dayMuted,
                    isSelected && styles.daySelectedText,
                    isToday && !isSelected && styles.dayToday,
                  ]}
                >
                  {date.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {dots.map((e, i) => (
                    <View
                      key={`${e.id}-${i}`}
                      style={[
                        styles.dot,
                        { backgroundColor: eventColorHex(e.color) },
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Agenda for selected day */}
        <View style={styles.agendaHeader}>
          <Text style={styles.agendaTitle}>{formatDayLabel(selected)}</Text>
          <Text style={styles.agendaCount}>
            {selectedEvents.length === 0
              ? 'No events'
              : selectedEvents.length === 1
                ? '1 event'
                : `${selectedEvents.length} events`}
          </Text>
        </View>

        {loading && events.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.emerald} />
          </View>
        ) : selectedEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={28} color={colors.textSecondary} />}
            title="Nothing scheduled"
            description="Tap the + to add an event for this day."
            compact
            action={
              <Button
                label="New event"
                size="sm"
                variant="primary"
                icon={<Plus size={16} color={colors.textOnAccent} />}
                onPress={openCreate}
              />
            }
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {selectedEvents.map((e) => (
              <Card
                key={e.id}
                variant="flat"
                accent={eventColorHex(e.color)}
                onPress={() => openEdit(e)}
              >
                <View style={styles.eventRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {e.title}
                    </Text>
                    {e.description ? (
                      <Text style={styles.eventDesc} numberOfLines={2}>
                        {e.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.eventTimeBlock}>
                    {e.all_day ? (
                      <Text style={styles.eventAllDay}>All day</Text>
                    ) : (
                      <>
                        <Text style={styles.eventTime}>
                          {formatTimeLabel(e.start_time)}
                        </Text>
                        {e.end_time ? (
                          <Text style={styles.eventTimeSub}>
                            {formatTimeLabel(e.end_time)}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <EventSheet
        open={sheetOpen}
        editing={editing}
        initialDate={selected}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveEvent}
        onDelete={editing ? () => handleDelete(editing.id) : undefined}
      />
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Event sheet
// ═══════════════════════════════════════════════════════════════════════

interface SheetProps {
  open: boolean;
  editing: CalendarEvent | null;
  initialDate: string;
  onClose: () => void;
  onSave: (payload: CreateEventInput) => void | Promise<void>;
  onDelete?: () => void;
}

function EventSheet({
  open,
  editing,
  initialDate,
  onClose,
  onSave,
  onDelete,
}: SheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateKey, setDateKey] = useState(initialDate);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState<EventColor>('blue');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setDateKey(editing.start_date);
      setAllDay(editing.all_day);
      setStartTime(
        editing.start_time ? editing.start_time.slice(0, 5) : '09:00'
      );
      setEndTime(editing.end_time ? editing.end_time.slice(0, 5) : '10:00');
      setColor(editing.color ?? 'blue');
    } else {
      setTitle('');
      setDescription('');
      setDateKey(initialDate);
      setAllDay(true);
      setStartTime('09:00');
      setEndTime('10:00');
      setColor('blue');
    }
  }, [open, editing, initialDate]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title', 'Every event needs a title.');
      return;
    }
    if (!allDay) {
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        Alert.alert('Invalid time', 'Use HH:MM format, e.g. 09:30.');
        return;
      }
    }
    setSaving(true);
    try {
      await onSave({
        title,
        description,
        start_date: dateKey,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : endTime,
        all_day: allDay,
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
            {editing ? 'Edit event' : 'New event'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="What's happening?"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional details"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={dateKey}
            onChangeText={setDateKey}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <View style={styles.toggleRow}>
            <Text style={styles.label}>All day</Text>
            <Pressable
              onPress={() => {
                haptics.select();
                setAllDay((v) => !v);
              }}
              style={[
                styles.toggle,
                allDay && { backgroundColor: colors.emerald },
              ]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  allDay && { marginLeft: 20 },
                ]}
              />
            </Pressable>
          </View>

          {!allDay ? (
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start</Text>
                <View style={styles.timeInputWrap}>
                  <Clock size={14} color={colors.textMuted} />
                  <TextInput
                    style={styles.timeInput}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End</Text>
                <View style={styles.timeInputWrap}>
                  <Clock size={14} color={colors.textMuted} />
                  <TextInput
                    style={styles.timeInput}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Color</Text>
          <View style={styles.colorRow}>
            {EVENT_COLORS.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => {
                  haptics.select();
                  setColor(c.key);
                }}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c.hex },
                  color === c.key && styles.colorSwatchSelected,
                ]}
                accessibilityLabel={c.label}
              />
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

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface800,
  },
  todayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
  },
  todayBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },

  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  daySelected: {
    backgroundColor: colors.emerald + '22',
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  dayNumber: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  dayMuted: {
    color: colors.textMuted,
  },
  dayToday: {
    color: colors.emerald,
    fontWeight: '800',
  },
  daySelectedText: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    height: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  agendaHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  agendaTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  agendaCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  loadingBlock: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },

  eventRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  eventTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  eventDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  eventTimeBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  eventTime: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  eventTimeSub: {
    ...typography.micro,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  eventAllDay: {
    ...typography.caption,
    color: colors.textSecondary,
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
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
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
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeInputWrap: {
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
  timeInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
    fontVariant: ['tabular-nums'],
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: colors.textPrimary,
    transform: [{ scale: 1.08 }],
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
