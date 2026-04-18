---
name: liftori-mobile
description: >
  Liftori's mobile app specialist — knows the Expo/React Native codebase inside out:
  SDK 51 constraints, expo-router conventions, SafeScreen primitive, haptics semantics,
  theme tokens, Supabase-on-device storage adapter, service/hook two-layer pattern, and
  the OneDrive-safe refactor moves. Use this skill whenever writing, debugging, or
  planning code for the Liftori mobile app. Triggers on: mobile, mobile app, iOS, Android,
  Expo, React Native, RN, EAS, APK, SafeScreen, useClock, pulseService, chatService,
  mobile Wave, app/(app)/, app/(auth)/, expo-router, tab, navigation, haptics, device,
  phone, or anything targeting the liftori-mobile repo.
---

# Liftori Mobile Agent

You are Liftori's mobile specialist. You build Expo/React Native features that match established patterns, respect SDK 51 constraints, and survive the OneDrive-synced checkout. You know where every primitive lives, when to add a service vs. a hook, and how to ship changes without tripping EAS.

## Repo Facts

| Item | Value |
|---|---|
| Repo | `JaxRhino/liftori-mobile` |
| Default branch | `main` (NOT master — unlike liftori-admin) |
| Checkout path | `C:\Users\ryanm\OneDrive\Desktop\Liftori Ai\liftori.ai\liftori-mobile` |
| Expo SDK | **~51.0.28** (pinned — do NOT upgrade mid-wave) |
| React Native | **0.74.5** |
| expo-router | ~3.5.23 (typed routes enabled via `experiments.typedRoutes`) |
| Language | TypeScript (strict) |
| Styling | NativeWind 4.1 + `src/lib/theme.ts` tokens (prefer tokens over NW classes) |
| State | React Context (Auth) + TanStack Query v5 (mounted globally, use for server state) |
| Icons | `lucide-react-native` |
| Supabase | `@supabase/supabase-js@^2.45` with expo-secure-store storage adapter |
| Bundle IDs | iOS `ai.liftori.mobile`, Android `ai.liftori.mobile` |
| EAS projectId | `b6c52b3d-9864-4839-b480-49cb95d5e354` |
| Build tracker | https://expo.dev/accounts/rhinomarch/projects/liftori-mobile/builds |
| Actions tracker | https://github.com/JaxRhino/liftori-mobile/actions |

## TSConfig Path Aliases

```ts
"@/*"  → "./src/*"   // Use this everywhere: @/components/Button, @/lib/haptics
"~/*"  → "./*"       // Rarely needed — app/ tree uses relative paths
```

**Always prefer `@/`** over deep relative imports. `import { Button } from '@/components/Button'` — never `../../../src/components/Button`.

## Directory Structure

```
app/
  _layout.tsx                 ← Root: ErrorBoundary → providers → Slot
  index.tsx                   ← Redirects to (app)/home if authed, else (auth)/login
  (auth)/
    _layout.tsx               ← Public stack
    login.tsx                 ← Email + password
  (app)/
    _layout.tsx               ← Tabs navigator (5 tabs)
    home.tsx                  ← Wave 2: mission control
    work.tsx                  ← Wave 3: my leads/tasks
    more.tsx                  ← Wave 5: identity + Pulse clock + sign out
    chat.tsx                  ← NEUTERED (export {};) — real routes live in chat/
    chat/                     ← Wave 4 nested stack
      _layout.tsx
      index.tsx               ← Channel list
      [channelId].tsx         ← Conversation + composer + realtime
    create.tsx                ← NEUTERED (export {};) — real routes live in create/
    create/                   ← Wave 1 wizard hub
      _layout.tsx
      index.tsx               ← 4-tile hub
      _ComingSoon.tsx         ← Shared placeholder (underscore keeps it out of routing)
      lead.tsx                ← Wave 1a
      consult.tsx             ← Wave 1b
      custom.tsx              ← Wave 1c
      appointment.tsx         ← Wave 1d
src/
  components/                 ← UI primitives (see table below)
  lib/                        ← Services, hooks, theme, clients
```

## Root Layout Provider Order (verified)

```
<ErrorBoundary>                       ← Catches provider-level crashes
  <GestureHandlerRootView>
    <SafeAreaProvider>
      <QueryClientProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <SplashGate>                ← Hides splash when auth.loading === false
            <Slot />
          </SplashGate>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
</ErrorBoundary>
```

The ErrorBoundary sits **outside** providers so auth/query crashes still render a fallback instead of force-closing. Never move it inside.

## UI Primitives — When to Use Each

| Component | Use for | Key props |
|---|---|---|
| `SafeScreen` | Every screen wrapper. Handles insets, keyboard avoidance, optional scroll + pull-to-refresh | `scroll`, `onRefresh`, `refreshing`, `bottom='apply'\|'skip'`, `top='apply'\|'skip'`, `disableKeyboardAvoid`, `backgroundColor` |
| `Header` | Top of any screen under SafeScreen | `title`, `subtitle`, `onBack`, `bordered`, `right` |
| `Card` | All content blocks. Variants swap elevation/border | `variant='elevated'\|'flat'\|'outline'`, `onPress` (makes it Pressable), `style` |
| `Button` | Primary actions | `label`, `variant='solid'\|'outline'\|'ghost'`, `size='sm'\|'md'\|'lg'`, `icon`, `fullWidth`, `loading`, `onPress` |
| `Input` | All text entry | Standard RN TextInput-ish |
| `Chip` | Selectable filters, tags, segmented choices | `label`, `selected`, `color`, `size`, `icon`, `onPress` |
| `Avatar` | User/entity avatar. **Prop is `url`, not `uri`** | `name` (for initials), `url`, `size='sm'\|'md'\|'lg'`, `ring` (color) |
| `EmptyState` | Zero-data, error, loading | `title`, `description`, `icon`, `action`, `compact` |
| `WizardShell` | Multi-step forms (`/create/*`) | `step`, `totalSteps`, `onBack`, `onNext`, `canAdvance`, `accentColor`, `nextLabel` |
| `ErrorBoundary` | Root only. Already mounted in `app/_layout.tsx` | Class component; child tree remounts via `resetKey` |

**SafeScreen contract** — read its prop defaults before adding screens:
```ts
scroll?: boolean              // default false
bottom?: 'apply' | 'skip'     // default 'apply' (tabs screens use 'skip')
top?: 'apply' | 'skip'        // default 'apply'
disableKeyboardAvoid?: boolean // default false (chat detail uses true + manual KAV)
```

## Haptics — Semantic Catalog

From `@/lib/haptics`. **Always use semantic names, never raw `Haptics.*`.**

| Export | Use for |
|---|---|
| `tap()` | Taps, nav changes, row presses |
| `bump()` | Primary button presses, wizard step advance |
| `thud()` | Destructive confirms, long-press |
| `success()` | Save/submit/celebrate |
| `warn()` | Validation failures, soft blocks |
| `error()` | Hard errors, rejected actions |
| `select()` | Dial/scroll/picker changes |

Example:
```ts
import * as haptics from '@/lib/haptics';
// ...
onPress={() => { haptics.bump(); onSubmit(); }}
```

## Theme Tokens — `@/lib/theme`

```ts
colors: emerald, emeraldDark, emeraldLight, purple, purpleDark, amber, sky,
        rose, indigo, bg, surface900, surface800, surface700, surface600,
        textPrimary, textSecondary, textMuted, textOnAccent,
        success, warning, error, info, border, borderStrong

spacing: xxs, xs, sm, md, lg, xl, xxl, xxxl        // token sizes, not raw numbers
radii:   xs, sm, md, lg, xl, pill
typography: display, h1, h2, h3, body, bodyMedium, caption, micro
```

**Spread typography into text style:**
```tsx
<Text style={[typography.h2, { color: colors.textPrimary }]}>...</Text>
```

## Product Accent Colors (Sales Pipeline)

| Product | Accent | Icon |
|---|---|---|
| `labos` | `colors.sky` | `Cpu` |
| `consulting` | `colors.amber` | `Briefcase` |
| `custom_build` | `colors.purple` | `Code` |

Used consistently by wizards, Home stats, Work grouping, and lead rows. Never invent new color mappings — reference `PRODUCTS` in `leadsService.ts`.

## Service + Hook Pattern (Two-Layer)

**All domain logic follows this split:**

1. `src/lib/xxxService.ts` — **pure RPC/query wrapper.** No React, no hooks. Exports types + async functions. Safe to unit test.
2. `src/lib/useXxx.ts` — **React glue** wrapping the service. Owns intervals, AppState listeners, state. Returns a useful shape to screens.

Reference implementation: `pulseService.ts` (session CRUD + tier catalog) + `useClock.ts` (1s display tick + 30s heartbeat + AppState refresh).

Services available:

| Service | Purpose | Companion hook |
|---|---|---|
| `supabase.ts` | Supabase client (secure-store adapter + chunking) | — |
| `AuthContext.tsx` | Auth provider + `useAuth()` | `useAuth()` |
| `theme.ts` | Design tokens | — |
| `haptics.ts` | Semantic haptic wrappers | — |
| `leadsService.ts` | Sales pipeline mirror (3 products + stage configs) | — |
| `appointmentsService.ts` | Consulting appointment CRUD (room_id gen, mirrors `book.html`) | — |
| `pulseService.ts` | Time-clock + tier catalog | `useClock()` |
| `chatService.ts` | Chat channels + messages + realtime | — |

## Supabase Client — Storage Adapter Gotcha

`src/lib/supabase.ts` wraps `expo-secure-store` because **SecureStore has a 2KB per-value cap on Android.** The adapter auto-chunks large session payloads into `{key}__0`, `{key}__1`, …, with a `sb-chunk-{count}` pointer. On web it falls back to `AsyncStorage`.

**Do not touch this file without testing on a real Android device.** The 2KB limit silently truncates, causing intermittent "session not found" bugs that only reproduce post-login on Android.

## `useAuth()` Return Shape

```ts
{
  session: Session | null;
  user: User | null;
  profile: Profile | null;   // { id, email, full_name, role, avatar_url, title }
  isAdmin: boolean;
  isFounder: boolean;
  loading: boolean;
  signInWithPassword(email, password): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}
```

## Expo-Router Gotchas

### 1. Nested group vs flat file on OneDrive

You CANNOT `fs.unlink` files in the OneDrive-synced checkout from the sandbox — the delete flaps. The fix is to **neutralize the flat sibling**:

```ts
// app/(app)/chat.tsx
/**
 * Deprecated — real routes live in ./chat/*. This stub keeps expo-router
 * from claiming the flat path so the directory stack can win.
 */
export {};
```

Applied to: `app/(app)/chat.tsx`, `app/(app)/create.tsx`. Leave both in place.

### 2. `router.push` + typed routes = cast until regeneration

`experiments.typedRoutes: true` regenerates `.expo/types/router.d.ts` on dev server start. New routes won't type-check until the next regeneration. **Use `as any` on pushes to new routes:**

```tsx
router.push(`/chat/${channelId}` as any);
router.push('/create/lead' as any);
```

Remove the cast after `.expo/types/router.d.ts` regenerates (the dev server prints "Discovered X files" when it does).

### 3. Tab screens use `bottom='skip'`

Anything under `(app)/` tabs already lives inside the tab bar's inset, so SafeScreen should skip bottom insets:

```tsx
<SafeScreen bottom="skip" scroll>
```

Stack screens pushed on top of tabs (e.g., `chat/[channelId].tsx`) use `bottom="apply"`.

## Realtime Subscriptions — Re-fetch With Join

`supabase.channel().on('postgres_changes', ...)` hands you `payload.new` which is the **raw row without joins.** If your UI shows `sender.full_name` or `profile.avatar_url`, the bubble renders blank.

**Always re-fetch with the same shape your list query uses:**

```ts
const { data } = await supabase
  .from('chat_messages')
  .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, email, avatar_url)')
  .eq('id', (payload.new as { id: string }).id)
  .maybeSingle();
if (data) onInsert(data as ChatMessage);
```

Also **dedupe by id** in state — your own insert arrives twice (once from `.insert().select()`, once from the subscription):

```ts
setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
```

## Scoping — "Mine or Unassigned"

Work and Home filter to leads where `(!assigned_to || assigned_to === user?.id)`. This matches the desktop tester/pool claim pattern — rows land in the pool until someone claims them, then only the claimer sees them on personal views. Never scope to `assigned_to === user?.id` alone; that hides unclaimed rows from everyone.

## Commit Conventions (same as liftori-coder, repeated here for offline reads)

**Format:** `[scope] description`
- `[mobile] Add root ErrorBoundary + port Pulse service/hook`
- `[mobile] Waves 2-5: Home, Work, Chat stack, More live Pulse`
- `[mobile] Fix Android session truncation in SecureStore adapter`
- `[docs] Session 23 — mobile Waves 2-5 + ErrorBoundary`

**Use multiple `-m` flags for multi-paragraph messages** — never heredocs in PowerShell (swallows the next command). See memory `feedback_heredoc_push_chain.md`.

## EAS Build Pipeline

- Workflow: `.github/workflows/eas-build.yml`
- Triggers: push to `main`/`master`, or manual dispatch (`workflow_dispatch`) with `platform` + `profile` inputs
- Profiles in `eas.json`:
  - `development` — iOS sim, dev client, internal
  - `preview` — iOS device + Android APK, internal (this is the one Ryan sideloads)
  - `production` — autoIncrement enabled

**Typical APK build:** 8–15 min for SDK 51. Download directly from the build detail page and sideload.

### EAS + OneDrive Tar Failure

If you ever run `eas build` **locally**, "Prepare project" dies with a tar permission error when source is under OneDrive. Move the checkout to `C:\dev\liftori-mobile` first. The GitHub Actions path bypasses this because the runner clones fresh from GitHub. See memory `feedback_eas_onedrive_tarball.md`.

## New Screen Template

```tsx
/**
 * One-line screen purpose.
 * Longer prose describing what lives here and any non-obvious behavior.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { colors, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';

export default function MyScreen() {
  const [loading, setLoading] = useState(false);

  const onRefresh = useCallback(async () => {
    // fetch
  }, []);

  return (
    <SafeScreen bottom="skip" scroll onRefresh={onRefresh} refreshing={loading}>
      <Header title="My Screen" />
      <View style={styles.body}>
        {/* content */}
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
```

## New Service Template

```ts
/**
 * xxxService — short description.
 *
 * Backed by:
 *   table_name — purpose
 *
 * Exports typed CRUD helpers. Pure (no React, no hooks).
 */
import { supabase } from './supabase';

export interface MyRow {
  id: string;
  /* ... */
  created_at: string;
}

export async function listRows(): Promise<MyRow[]> {
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as MyRow[]) || [];
}

export async function createRow(payload: Partial<MyRow>): Promise<MyRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('table_name')
    .insert({ ...payload, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as MyRow;
}
```

## Quality Standards

1. **Every Supabase call wrapped in try/catch.** Never let a network error bubble uncaught into render.
2. **Every data-fetching screen shows a loading state** (spinner, skeleton, or "Loading…" text).
3. **Every zero-data case uses `EmptyState`** — never a blank screen.
4. **Every destructive/primary action fires a haptic** (semantic name from `@/lib/haptics`).
5. **Tabular-nums for live clock digits:** `fontVariant: ['tabular-nums']` to keep widths stable.
6. **No `console.log` in production code.** Remove before commit.
7. **No hardcoded color hexes** in screens — reference `colors.*` from theme.
8. **No relative imports crossing src/** — always use `@/` alias.

## Hard-Won Gotchas (Learning Loop)

<!-- Format: [Date] — [Pattern] — [Context] -->

2026-04-18 — **`AppState.addEventListener('change', …)` is the mobile `visibilitychange`.** Every poller / receiver in the app should hook `state === 'active'` alongside its `setInterval`, otherwise a phone left backgrounded overnight misses events until the next tick fires. Reference: `AnnouncementModal.tsx` refresh hook + `useClock.ts` resume logic.

2026-04-18 — **`Modal` with `statusBarTranslucent` is the "floats over every tab" pattern.** No need for a dedicated portal host — as long as the component is mounted inside the provider tree (e.g. as a sibling of `<Slot />` inside `SplashGate`), a `visible transparent` `Modal` renders above every screen including the tab bar. Reference: `app/_layout.tsx` + `AnnouncementModal.tsx`.

2026-04-18 — **Keep audience / eligibility logic on the server.** The mobile announcement receiver is ~10 lines of data logic because every "should I see this?" decision stays in the `get_active_announcements_for_me` RPC + `announcement_acknowledgments` RLS. The only client-side filter is a local `ackedRef: Set<string>` for dedup during RPC latency. Porting to another surface (email digest, desktop toast) re-uses the same RPC; no duplicated rules.

2026-04-18 — **Optimistic snapshot/revert is the default for detail-screen edits.** Pattern: capture `const snapshot = lead`, apply `setLead({...lead, ...updates})` locally, fire the Supabase update, on success replace with the server's response (gets fresh `updated_at`, joined rows); on error restore snapshot + `haptics.error()` + `Alert.alert`. Reference: `app/(app)/lead/[id].tsx` `patch()` helper. Makes the UI feel instant on flaky networks and never leaves the screen in a lying state.

2026-04-18 — **Save-on-blur for embedded text fields in detail screens.** Don't save on every keystroke (N round-trips) and don't save on mount (stomps the server). Local text state + `onBlur` that compares `clean !== (lead.field || null)` before calling the patch. Notes + next-action both use this in `lead/[id].tsx`. Pair with a `useEffect` that syncs local state from `lead.field` so external refreshes don't lose user input.

2026-04-18 — **Confirm backward + closed stage moves, one-tap forward.** Reps move leads forward constantly, backward rarely. `Alert.alert` on `newStage === 'won' || newStage === 'lost' || toIdx < fromIdx`; everything else is one-tap + `haptics.bump()`. `haptics.success()` only on `won`. Captured in `lead/[id].tsx` `confirmStage()`.

2026-04-18 — **Quick-date chips beat a native date picker for mobile sales flows.** Field reps almost always want "today / tomorrow / +3 days / +1 week / clear." Shipping those as a `Chip` row is faster than tapping into a native picker AND avoids adding `@react-native-community/datetimepicker` as a dep. Only add the picker when someone explicitly asks for an arbitrary future date.

2026-04-18 — **PowerShell `(app)` is a subexpression — quote EVERY path.** `git add app/(app)/lead.tsx ...` fails with `"The term 'app' is not recognized as the name of a cmdlet"` because PowerShell parses `(app)` as a subexpression call. Partial quoting (just `[id].tsx`) still breaks the rest. Rule: if any path contains `(`, `)`, `[`, or `]`, quote **all** paths in the command.

2026-04-18 — **ErrorBoundary must wrap providers, not just the router.** Auth/Query crashes at boot are swallowed silently if the boundary sits inside them. Put it at the absolute outermost layer of `app/_layout.tsx`.

2026-04-18 — **Two-interval pattern for live clocks.** Fast display tick (1s) + slow server heartbeat (30s) beats unifying on one cadence. UI never drifts >1s; network stays at 2 req/min.

2026-04-18 — **Directory-based routes are the OneDrive-safe refactor path.** Can't `fs.unlink` flat siblings reliably, but `export {};` neuters them and lets expo-router auto-route to the directory.

2026-04-18 — **Always re-fetch realtime inserts with the join you render with.** Shipping `payload.new` straight into state shows nameless bubbles until the next mount.

2026-04-18 — **Avatar prop is `url`, not `uri`.** Verified in `components/Avatar.tsx`. The sender profile's `avatar_url` passes straight through.

2026-04-17 — **Supabase auth tokens >2KB break on Android without chunking.** The secure-store adapter in `src/lib/supabase.ts` handles this; don't simplify it.

2026-04-17 — **EAS "Prepare project" tar permission-denied = OneDrive.** Local builds must run from `C:\dev\...`, not the OneDrive-synced checkout. GitHub Actions isn't affected because the runner clones fresh.

2026-04-16 — **PowerShell heredoc + chained commands corruption.** Multi-line `-m "..."` swallows the next command in PS. Use multiple `-m` flags on one line; push in a separate block.

2026-04-16 — **OneDrive append-race on patched files.** Never `>>` patch OneDrive-synced files from bash. Use the `Edit` tool with full-context replacements so the write is idempotent.

2026-04-15 — **Do not upgrade Expo SDK mid-wave.** SDK 51 is pinned. Bumping mid-flight breaks lucide-react-native, NativeWind plugin, and the secure-store adapter. Schedule SDK bumps as their own dedicated wave.
