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

## Deploy Pipeline — OTA Updates vs. Native Builds

**The default deploy for any JS/TS change is an OTA update, not a full rebuild.** Every push to `main` fires `eas update`, which ships a new JS bundle to installed apps in ~30 seconds. Full native APK rebuilds (15 min) are reserved for app version bumps or native config changes.

### OTA Update — default for every push

- Workflow: `.github/workflows/eas-update.yml`
- Trigger: push to `main`/`master` (auto), or manual dispatch with `channel` + `message` inputs
- Command: `eas update --channel <channel> --message "<commit msg>"`
- Channels map 1:1 to build profiles (`preview`, `production`, `development`) via the `channel` key in each `eas.json` profile
- App-side: `src/lib/updates.ts` + `UpdatesListener` in `app/_layout.tsx` silently check on boot + on `AppState='active'`, fetch the new bundle, and apply it on the next cold start
- Bypass: include `[skip update]` in the commit message if you only touched docs
- Dev safety: `__DEV__` and `Updates.isEnabled === false` both short-circuit the updater, so running `expo start` on a dev client never fights Metro

**When the app boots with a staged update:** users see no interruption. The new bundle is applied when they next cold-start (closing/reopening, or after the OS kills the backgrounded app). Most users see updates within a few hours without noticing.

### Native build — manual, rare

- Workflow: `.github/workflows/eas-build.yml` (`workflow_dispatch` only — no auto-fire)
- Run when you:
  - bump `version` in `app.config.ts`
  - add/modify a native plugin in `plugins: [...]`
  - change permissions / entitlements / `infoPlist` / `UIBackgroundModes`
  - install a new native dependency (anything with an `app.plugin.js` or autolinked native code)
- Profiles in `eas.json`:
  - `development` — iOS sim, dev client, internal, `channel: development`
  - `preview` — iOS device + Android APK, internal, `channel: preview` (this is the one Ryan sideloads)
  - `production` — autoIncrement enabled, `channel: production`

**Typical APK build:** 8–15 min for SDK 51. Download directly from the build detail page and sideload.

### Rule of thumb

- Added a screen, tweaked copy, fixed a bug in a service, added a component? → OTA (nothing to do; auto-fires on push).
- Bumped `expo-*` or `react-native-*` to a version with native code changes, added a permission, changed the app icon? → Manually trigger `eas-build.yml` from the Actions tab.

### EAS + OneDrive Tar Failure

If you ever run `eas build` **locally**, "Prepare project" dies with a tar permission error when source is under OneDrive. Move the checkout to `C:\dev\liftori-mobile` first. The GitHub Actions path bypasses this because the runner clones fresh from GitHub. See memory `feedback_eas_onedrive_tarball.md`.

### Runtime version discipline

`runtimeVersion.policy: 'appVersion'` in `app.config.ts` means OTA updates **only land on APKs that share the same `version`** (currently `0.1.0`). If you bump `version`, every installed APK at the old version stops receiving updates until you ship a new APK. This is the feature, not a bug — it prevents a JS bundle written against new native APIs from crashing an old APK that doesn't have those APIs yet.

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

2026-04-18 — **Reuse `chat-files` + the existing attachments JSON shape — don't invent a new bucket.** When adding image attachments to mobile chat, the admin web app was already posting to a shared `chat-files` public bucket at `chat/{userId}/{timestamp}.{ext}` and stamping `chat_messages.attachments` as `[{ url, size, filename, file_type }]`. Mobile writes the exact same shape so posts round-trip across surfaces. A pure-attachment (no caption) message still needs non-null `content` — stamp a single-glyph placeholder (`📷` / `📎`) server-side and *hide* it client-side when `attachments[0].file_type === 'image'` so the bubble doesn't show a lonely camera emoji under the photo. Reference: `src/lib/chatService.ts` → `uploadChatAttachment` / `sendMessage`, `app/(app)/chat/[channelId].tsx` → `MessageBubble` `isPlaceholder` check.

2026-04-18 — **`fetch(localUri).arrayBuffer()` beats `Blob` for Supabase uploads on RN.** React Native's `fetch` → `blob()` path sometimes posts a 0-byte body to Supabase Storage on iOS, silently producing an unreadable file. Read the image URI as an `ArrayBuffer` instead and pass it to `.upload(path, arrayBuf, { contentType })`. Same pattern works for PNG/JPEG/WebP/HEIC; HEIC files require setting `contentType: 'image/heic'` explicitly because the content-type inferred from the URI is often wrong on iOS.

2026-04-18 — **expo-image-picker was installed + configured in Wave 0 — no rebuild for chat photos.** The dep was already in `package.json` and the plugin was already registered in `app.config.ts` with both `photosPermission` and `cameraPermission` strings (matching `NSPhotoLibraryUsageDescription` + `NSCameraUsageDescription` in iOS `infoPlist` and `CAMERA` in Android `permissions`). That meant adding photo-in-chat was a pure-OTA change — no `eas build` needed. Always check `app.config.ts` plugin list + `package.json` deps before claiming a feature needs a native rebuild.

2026-04-18 — **Ship a Settings screen with a user-visible "Reload with latest" affordance.** OTA updates apply on the next cold start by default; testers don't want to force-close the app to pull a patch. Settings exposes `Updates.checkForUpdateAsync` → `fetchUpdateAsync` (stage only) and `forceReloadToLatest` (stage + `Updates.reloadAsync` immediately). Both are guarded with `__DEV__ || !Updates.isEnabled` → friendly "OTA unavailable" alert instead of silent failure. Settings doubles as the bug-triage crib sheet: channel / runtimeVersion / current updateId / published timestamp / native build — if something looks wrong in a field report, the tester opens Settings and reads out the line that disagrees with expectations. Reference: `app/(app)/settings.tsx` + `src/lib/updates.ts`.

2026-04-18 — **`Application.nativeApplicationVersion` vs. `Constants.expoConfig.version`.** They usually match, but after an OTA update the JS-side `expoConfig.version` reflects the *shipped bundle's* version while `Application.nativeApplicationVersion` reports the *installed APK's* version. Show both ("App version" = native, "Expo SDK" = bundle config's sdkVersion) so anyone debugging an install can tell whether the divergence is the OTA pipeline working as intended or a mismatched APK. Reference: Settings About section.

2026-04-18 — **Capture device info at submit time, not at screen mount.** Bug reports from OTA builds need `Updates.updateId` and `Updates.channel` alongside `Constants.expoConfig.version` — the JS bundle can drift ahead of the APK's `version` by several OTA updates. Snapshot everything via `captureDeviceInfo()` when the form submits so the report reflects the build they actually hit the bug on, not the build they opened the screen on. Reference: `src/lib/bugReportsService.ts`.

2026-04-18 — **EmptyState prop is `description`, not `body`.** Double-checked in `components/EmptyState.tsx`. Passing `body` is a silent no-op — the description just doesn't render. Bit me once in notifications.tsx and once in bug-report.tsx; capture here so it doesn't bite a third time.

2026-04-18 — **`href: null` hides a Tabs.Screen from the tab bar without leaving the router.** The notifications inbox lives inside `(app)/notifications.tsx` and is still routable via `router.push('/notifications')`, but adding `<Tabs.Screen name="notifications" options={{ href: null }} />` in the layout keeps it out of the visible tab strip. Cleaner than nesting a separate Stack navigator just to hide one screen. Reference: `app/(app)/_layout.tsx`.

2026-04-18 — **HEAD + count beats SELECT + length for unread badges.** `supabase.from('notifications').select('id', { count: 'exact', head: true }).eq(...)` returns a count without any rows — Supabase responds with `Content-Range` and an empty body. Use for anywhere you render just a number (More-tab unread count, pending approvals badge), never pull the full row set for a count. Reference: `fetchUnreadCount` in `src/lib/notificationsService.ts`.

2026-04-18 — **Realtime subscription + AppState refetch = complete coverage.** Realtime covers foreground INSERTs; AppState `change → active` covers anything that landed while the socket was asleep. Either alone leaves a hole (pure Realtime misses background events, pure polling wastes battery). Pattern: subscribe on mount, `AppState.addEventListener('change', s => s === 'active' && refetch())`, return a cleanup that removes both. Reference: `app/(app)/notifications.tsx` useEffect hooks.

2026-04-18 — **OTA first, native builds last.** A full APK rebuild is a 15-minute tax that's only justified when the change requires native code. For anything JS-only (new screens, services, components, copy), rely on `eas update` — the commit→on-device time drops from 15 min to ~30 seconds. The update workflow auto-fires on every push to `main`; native rebuilds are manual-only via `eas-build.yml`'s `workflow_dispatch`. If a change requires a native rebuild (new permission, new plugin, bumped `version`), say so in the commit and manually trigger the build workflow. Skip an OTA with `[skip update]` in the commit message.

2026-04-18 — **`runtimeVersion.policy: 'appVersion'` binds OTA bundles to the APK's `version`.** Bumping `version` in `app.config.ts` means every installed APK at the old version stops receiving OTA updates until users sideload the new APK. That's the correct behavior (a JS bundle written against new native APIs would crash an old APK without them), but remember to ship the APK update when bumping — otherwise testers will silently stop seeing new builds.

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
