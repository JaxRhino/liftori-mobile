/**
 * updates — helpers around expo-updates.
 *
 * The app boots, renders normally, then in the background we ask Expo's
 * update server "is there a newer JS bundle for my channel?" If yes, we
 * download it and schedule a reload for the next cold start. We don't
 * interrupt the user mid-session — silent-apply + next-launch is the
 * least jarring UX for a tester-grade build.
 *
 * Everything here is a no-op in development (dev-client doesn't want
 * OTA overrides — you'd end up running a stale JS bundle while tweaking
 * code in Metro).
 */
import * as Updates from 'expo-updates';

/**
 * Called on every cold start and on AppState=active. Silently checks,
 * downloads, and stages the newest bundle. We never call reloadAsync here
 * — the user would lose their scroll state mid-task. The bundle lands on
 * next cold start.
 */
export async function checkForUpdatesSilently(): Promise<void> {
  if (!Updates.isEnabled || __DEV__) return;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      // eslint-disable-next-line no-console
      console.log('[updates] New bundle staged — will apply on next cold start.');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[updates] Silent check failed:', e);
  }
}

/**
 * Force-reload into the freshest bundle Expo has for us. Only call this
 * from an explicit "reload now" affordance in settings / more tab.
 */
export async function forceReloadToLatest(): Promise<void> {
  if (!Updates.isEnabled || __DEV__) return;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
    }
    await Updates.reloadAsync();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[updates] Force reload failed:', e);
  }
}

/**
 * Human-readable metadata for the About / Settings screen.
 */
export function currentUpdateInfo() {
  return {
    updateId: Updates.updateId ?? null,
    channel: Updates.channel ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    createdAt: Updates.createdAt?.toISOString() ?? null,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  };
}
