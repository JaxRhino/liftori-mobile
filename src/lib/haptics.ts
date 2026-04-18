/**
 * Haptics — thin wrapper around expo-haptics with semantic names.
 *
 * Fails silently if haptics are unavailable (simulator, unsupported device,
 * or user-disabled system haptics). Never throws.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function safe(fn: () => void | Promise<void>) {
  try {
    // Web has no haptics; expo-haptics is a no-op there but the call can still
    // throw on older setups, so we guard anyway.
    if (Platform.OS === 'web') return;
    void fn();
  } catch {
    // intentionally ignored
  }
}

/** Light bump — taps, nav changes. */
export const tap = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Medium bump — primary button presses, wizard step advances. */
export const bump = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** Strong thud — destructive confirms, long-press triggers. */
export const thud = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

/** Success chime — save, submit, celebrate. */
export const success = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Warning chime — validation failures, soft blocks. */
export const warn = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** Error chime — hard errors, rejected actions. */
export const error = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** Selection tick — dial / scroll / picker position changes. */
export const select = () => safe(() => Haptics.selectionAsync());
