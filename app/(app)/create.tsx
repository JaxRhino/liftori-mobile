/**
 * DEPRECATED — superseded by `app/(app)/create/` directory.
 *
 * The Wave 1a refactor moved the Create hub into `create/index.tsx` and
 * introduced `create/_layout.tsx` so each quick-capture wizard can live at
 * `/create/<name>`. This file no longer has a default export, so expo-router
 * ignores it. Once OneDrive lets us delete without fuss, remove this file.
 */
export {};
