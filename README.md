# Liftori Mobile

The Liftori companion app — a native iOS + Android experience for the Liftori team and, in a later phase, Liftori customers.

Built with **Expo SDK 51 + React Native 0.74 + TypeScript + expo-router + NativeWind + Supabase**.

---

## What ships in Wave 0 (this commit)

- Expo + TypeScript project bootstrap (SDK 51, RN 0.74)
- `expo-router` typed routes with an `(auth)` + `(app)` route group split
- Supabase auth hooked into device keychain via `expo-secure-store` (chunked storage, Android ≤ 2KB per value)
- `SafeScreen` primitive — the canonical wrapper that handles top + bottom safe-area insets, keyboard avoidance, and pull-to-refresh. **Use this on every route.**
- Core design primitives: `Button`, `Card`, `Input`, `Avatar`, `Header`, `EmptyState`
- Semantic haptics helper (`tap`, `bump`, `thud`, `success`, `warn`, `error`, `select`)
- Auth shell: login screen, auth guard, redirect-on-session-change
- 5-tab bottom shell: **Home · Work · Create(+) · Chat · More**
- Cool Liftori app icon + splash screen (rising emerald bars on slate, SVG source)
- `React Query` provider + dark status bar + sign-out flow

Everything beyond this ships across Waves 1–9.

---

## Prerequisites

- Node 20.x (LTS)
- `npm` (or `pnpm` / `yarn` — instructions use npm)
- Xcode 15+ (for iOS simulator) or Android Studio (for Android emulator)
- An [Expo account](https://expo.dev) if you plan to run `eas build`

---

## First-time setup

From `liftori.ai/liftori-mobile/`:

```bash
# 1. Install deps
npm install --legacy-peer-deps

# 2. Generate app icon + splash PNGs from the SVG sources
npm run assets:gen

# 3. Create your .env.local from the example
cp .env.example .env.local
# (The .example file already ships with the live Liftori Supabase URL + anon key —
#  no changes needed unless you're pointing at a branch DB.)

# 4. Start the dev server
npm run start
```

Then press `i` to open iOS simulator, `a` for Android, or scan the QR code with the **Expo Go** app on a physical device.

---

## Project structure

```
liftori-mobile/
├── app/                       # expo-router routes
│   ├── _layout.tsx            # Root: providers + splash gate
│   ├── index.tsx              # Auth-aware redirect
│   ├── (auth)/
│   │   ├── _layout.tsx        # Redirects out if already signed in
│   │   └── login.tsx          # Email/password sign-in
│   └── (app)/
│       ├── _layout.tsx        # 5-tab bottom shell + auth guard
│       ├── home.tsx           # Home tab
│       ├── work.tsx           # Work tab
│       ├── create.tsx         # Create (+) tab — Wave 1 wizard entry
│       ├── chat.tsx           # Chat tab
│       └── more.tsx           # Profile + sign out + hub shortcuts
├── assets/                    # Generated PNGs (icon, splash, favicon, notification)
├── assets-src/                # SVG source for all assets
├── scripts/gen-assets.mjs     # SVG -> PNG generator
├── src/
│   ├── components/            # Reusable UI primitives
│   │   ├── SafeScreen.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Avatar.tsx
│   │   ├── Header.tsx
│   │   └── EmptyState.tsx
│   └── lib/
│       ├── AuthContext.tsx    # session + profile provider
│       ├── haptics.ts         # semantic haptic wrappers
│       ├── supabase.ts        # client + SecureStore adapter
│       └── theme.ts           # colors / spacing / typography
├── app.config.ts              # Expo config (reads from EXPO_PUBLIC_* env)
├── babel.config.js            # NativeWind + reanimated
├── eas.json                   # EAS build profiles
├── global.css                 # Tailwind entry
├── metro.config.js            # Metro + NativeWind
├── tailwind.config.js         # Brand tokens
└── tsconfig.json              # Strict mode, path aliases (@/ and ~/)
```

---

## Key conventions

### Every screen wraps in `SafeScreen`

Never use `<View>` at the route root. `SafeScreen` handles top + bottom insets, keyboard avoidance, pull-to-refresh, and status bar style. Tab screens pass `bottom="skip"` because the tab bar already owns the bottom inset.

### Haptics on every significant press

Import `* as haptics from '@/lib/haptics'`. Our `Button` component already wires a variant-appropriate haptic on press. For bespoke Pressables, call `haptics.tap()` / `haptics.bump()` / `haptics.thud()` / etc.

### Path aliases

- `@/…` → `./src/…`
- `~/…` → repo root

### Auth gate

Routes in `(app)` require a session. `(app)/_layout.tsx` redirects to `/(auth)/login` if the session is null. The root `_layout.tsx` holds the splash screen visible until `AuthContext.loading` resolves, so no auth flash on cold start.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run start` | Dev server |
| `npm run ios` / `npm run android` | Dev server targeting a platform |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint pass |
| `npm run assets:gen` | Re-render app icon + splash PNGs from `assets-src/*.svg` |
| `npm run prebuild` | Regenerate native `ios/` + `android/` folders |
| `npm run build:ios` | EAS build (iOS, preview profile) |
| `npm run build:android` | EAS build (Android, preview profile) |

---

## Environment variables

Everything app-side reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. These live in `.env.local` (gitignored) — copy from `.env.example`.

For EAS cloud builds, add them to your EAS project secrets:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://qlerfkdyslndjbaltkwo.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"
```

---

## Mobile build waves

1. **Wave 0 — Shell (this commit):** bootstrap, auth, tab shell, design primitives, icon
2. **Wave 1 — Flagship Wizard:** the demo piece — new lead / consulting / custom build / appointment quick-add
3. **Wave 2 — Chat + DMs + push**
4. **Wave 3 — Pulse clock + leaderboard**
5. **Wave 4 — Announcements + acks + bug report flow**
6. **Wave 5 — Sales Hub**
7. **Wave 6 — Operations Hub** (WOs, crews, inventory w/ barcode, jobs map)
8. **Wave 7 — Marketing Hub** (campaigns, blog editor, content calendar)
9. **Wave 8 — EOS + video calling** (Daily.co)
10. **Wave 9 — Distribution:** EAS builds, App Store, Play Store, QR code on liftori.ai, team announcement

---

## Troubleshooting

- **"Unable to resolve module @/..."** — re-run `npm install --legacy-peer-deps`, then restart Metro with `npm run start -- --clear`.
- **Expo Go signs in but restart logs you out** — SecureStore failed to write the chunked session. Uninstall Expo Go and reinstall, or fall back to a Dev Client build (`eas build --profile development`).
- **Android icon looks clipped** — the adaptive icon's safe zone is ~66% of the canvas. The `adaptive-icon.svg` keeps the mark inside that zone; if you edit it, preview with the [Android adaptive icon preview tool](https://icon.kitchen).
- **Splash screen doesn't hide** — `SplashScreen.hideAsync()` runs once `AuthContext.loading` is false. If you see a stuck splash, check the console for an error inside `AuthProvider`'s init effect.

---

## Accessibility

- Dark theme only in v1 (`userInterfaceStyle: 'dark'`).
- All touch targets are ≥ 44×44 pt.
- `Button`, back-arrow, and tab buttons expose `accessibilityRole="button"` + `accessibilityLabel`.
- Text never uses color alone to convey meaning (paired with icons + labels).

---

## License

Proprietary — Liftori, LLC. Internal use only.
