/**
 * AnnouncementModal — global receiver for platform announcements.
 *
 * Mounted once at the root under `AuthProvider`. Polls `fetchActiveForMe`
 * every 60s (and on AppState=active) so a team member never misses a
 * founder broadcast. Renders the head announcement in a full-screen
 * `Modal` overlay; acking inserts into `announcement_acknowledgments`
 * and advances the queue.
 *
 * Audience filtering is 100% server-side (RPC + RLS). The client only
 * adds a cheap role check to save a network round-trip for customers,
 * and a local `acked` set so the 60s poller doesn't resurrect a card
 * the user just dismissed (before the RPC reflects the new ack).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Building2,
  Info,
  Megaphone,
  PartyPopper,
  Rocket,
  Sparkles,
} from 'lucide-react-native';

import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import {
  Announcement,
  Priority,
  acknowledgeAnnouncement,
  fetchActiveForMe,
} from '@/lib/announcementsService';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

const POLL_INTERVAL_MS = 60_000;

export function AnnouncementModal() {
  const { user, profile, loading: authLoading } = useAuth();
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const ackedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Gate: real user, done loading, not a customer-role account.
  const eligible =
    !authLoading && !!user && !!profile && profile.role !== 'customer';

  const refresh = useCallback(async () => {
    if (!eligible) return;
    try {
      const rows = await fetchActiveForMe();
      if (!mountedRef.current) return;
      // Drop any announcements we've just acked locally but the RPC hasn't
      // caught up on yet. Those will disappear on the next poll naturally.
      const filtered = rows.filter((r) => !ackedRef.current.has(r.id));
      setQueue(filtered);
    } catch (e) {
      // Service logs the error; keep the queue as-is so the UI doesn't flap.
      // eslint-disable-next-line no-console
      console.warn('[AnnouncementModal] refresh failed:', e);
    }
  }, [eligible]);

  // Initial fetch + poll interval.
  useEffect(() => {
    mountedRef.current = true;
    if (!eligible) {
      setQueue([]);
      return;
    }
    void refresh();
    const id = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [eligible, refresh]);

  // Pull fresh announcements whenever the app comes back to foreground —
  // otherwise a user who opened the app yesterday and left it backgrounded
  // would miss a broadcast posted overnight until the next 60s tick.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [refresh]);

  const current = queue[0];
  const total = queue.length;
  const remaining = total;

  const accent = useMemo(
    () => (current ? accentColor(current.accent_color) : colors.emerald),
    [current],
  );

  const Icon = useMemo(() => iconFor(current?.icon || null), [current]);

  const onAck = useCallback(async () => {
    if (!current || !user || submitting) return;
    setSubmitting(true);
    haptics.success();
    const id = current.id;
    // Optimistic: drop the head from the queue immediately so the user
    // sees the next card (or a dismiss) without waiting on the insert.
    setQueue((prev) => prev.filter((a) => a.id !== id));
    ackedRef.current.add(id);
    try {
      await acknowledgeAnnouncement(id, user.id);
    } catch (e) {
      // If the insert fails (network, RLS), roll the announcement back so
      // the user gets another chance on the next poll.
      ackedRef.current.delete(id);
      // eslint-disable-next-line no-console
      console.warn('[AnnouncementModal] ack failed:', e);
      haptics.error();
      void refresh();
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [current, user, submitting, refresh]);

  if (!eligible || !current) return null;

  const priorityBadge = priorityLabel(current.priority);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Android back button — treat as ack so the user can dismiss.
        void onAck();
      }}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { borderColor: accent }]}>
          {/* Counter pill — only when multiple queued */}
          {total > 1 ? (
            <View style={styles.counterRow}>
              <Text style={[typography.micro, { color: colors.textMuted, letterSpacing: 1.2 }]}>
                {remaining} NEW · TAP TO DISMISS EACH
              </Text>
            </View>
          ) : null}

          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.18) }]}>
            <Icon size={26} color={accent} />
          </View>

          {/* Priority tag */}
          {priorityBadge ? (
            <View style={[styles.priorityPill, { backgroundColor: withAlpha(accent, 0.14) }]}>
              <Text style={[styles.priorityText, { color: accent }]}>{priorityBadge}</Text>
            </View>
          ) : null}

          {/* Title */}
          <Text style={styles.title}>{current.title}</Text>

          {/* Body — scrolls if long */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.body}>{current.body}</Text>
          </ScrollView>

          {/* Ack button */}
          <Button
            label={total > 1 ? 'Got it — next' : 'Got it'}
            onPress={onAck}
            loading={submitting}
            fullWidth
            hapticStyle="none"
            style={[styles.ackBtn, { backgroundColor: accent }]}
          />
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function accentColor(key: string): string {
  switch (key) {
    case 'sky':
      return colors.sky;
    case 'amber':
      return colors.amber;
    case 'violet':
    case 'purple':
      return colors.purple;
    case 'rose':
      return colors.rose;
    case 'indigo':
      return colors.indigo;
    case 'emerald':
    default:
      return colors.emerald;
  }
}

function iconFor(name: string | null) {
  // Map the lucide-react icon names the admin UI uses to their RN equivalents.
  switch ((name || '').toLowerCase()) {
    case 'partypopper':
    case 'party-popper':
      return PartyPopper;
    case 'rocket':
      return Rocket;
    case 'building2':
    case 'building-2':
      return Building2;
    case 'info':
      return Info;
    case 'sparkles':
      return Sparkles;
    case 'alerttriangle':
    case 'alert-triangle':
      return AlertTriangle;
    case 'megaphone':
    default:
      return Megaphone;
  }
}

function priorityLabel(p: Priority): string | null {
  if (p === 'urgent') return 'URGENT';
  if (p === 'important') return 'IMPORTANT';
  return null;
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    backgroundColor: colors.surface900,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  counterRow: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  priorityPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  priorityText: {
    ...typography.micro,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  bodyScroll: {
    maxHeight: 260,
  },
  bodyContent: {
    paddingBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  ackBtn: {
    marginTop: spacing.sm,
  },
});
