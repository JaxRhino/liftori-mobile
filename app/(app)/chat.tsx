/**
 * DEPRECATED — superseded by `app/(app)/chat/` directory.
 *
 * Wave 4 moved Chat into a nested stack (`chat/_layout.tsx` + `chat/index.tsx`
 * + `chat/[channelId].tsx`) so we can push conversation detail screens with
 * native back-swipe behavior. This file no longer has a default export, so
 * expo-router ignores it. Delete once OneDrive lets us.
 */
export {};
