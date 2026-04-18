/**
 * Supabase client — mobile
 *
 * Uses expo-secure-store for session persistence so the auth token lives in the
 * device keychain (iOS) / EncryptedSharedPreferences (Android), not AsyncStorage.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient, processLock } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Storage adapter — SecureStore on native, AsyncStorage on web.
// SecureStore has a 2KB value cap on Android, so we chunk larger values.
// ---------------------------------------------------------------------------
const LARGE_VALUE_KEY_PREFIX = 'sb-chunk-';

const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value === null) return null;
      // If the value is a chunk pointer, reassemble
      if (value.startsWith(LARGE_VALUE_KEY_PREFIX)) {
        const count = parseInt(value.slice(LARGE_VALUE_KEY_PREFIX.length), 10);
        if (Number.isNaN(count) || count <= 0) return value;
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
          const part = await SecureStore.getItemAsync(`${key}__${i}`);
          if (part === null) return null;
          parts.push(part);
        }
        return parts.join('');
      }
      return value;
    } catch (err) {
      console.warn('[supabase][secureStore] getItem failed:', err);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const CHUNK_SIZE = 1800; // SecureStore value size limit is ~2KB on Android
      if (value.length > CHUNK_SIZE) {
        const count = Math.ceil(value.length / CHUNK_SIZE);
        await SecureStore.setItemAsync(key, `${LARGE_VALUE_KEY_PREFIX}${count}`);
        for (let i = 0; i < count; i++) {
          const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await SecureStore.setItemAsync(`${key}__${i}`, slice);
        }
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (err) {
      console.warn('[supabase][secureStore] setItem failed:', err);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const existing = await SecureStore.getItemAsync(key);
      if (existing?.startsWith(LARGE_VALUE_KEY_PREFIX)) {
        const count = parseInt(existing.slice(LARGE_VALUE_KEY_PREFIX.length), 10);
        if (!Number.isNaN(count)) {
          for (let i = 0; i < count; i++) {
            await SecureStore.deleteItemAsync(`${key}__${i}`);
          }
        }
      }
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn('[supabase][secureStore] removeItem failed:', err);
    }
  },
};

const storage = Platform.OS === 'web' ? AsyncStorage : secureStoreAdapter;

// ---------------------------------------------------------------------------
// Credentials — read from app.config.ts `extra` (populated from EXPO_PUBLIC_*)
// ---------------------------------------------------------------------------
const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud runtime error — dev should see this immediately.
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and restart the dev server.'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});
