import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Liftori Mobile — Expo app config
 *
 * Uses app.config.ts (instead of app.json) so we can read env at build time
 * and compute values dynamically (e.g. runtimeVersion per platform).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Liftori',
  slug: 'liftori-mobile',
  scheme: 'liftori',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: false,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0f172a',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ai.liftori.mobile',
    buildNumber: '1',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSCameraUsageDescription:
        'Liftori uses the camera for video calls with your team and clients.',
      NSMicrophoneUsageDescription:
        'Liftori uses the microphone for video calls and voice notes.',
      NSPhotoLibraryUsageDescription:
        'Liftori lets you attach images to chats, bug reports, and client records.',
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: 'ai.liftori.mobile',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'VIBRATE',
      'INTERNET',
      'POST_NOTIFICATIONS',
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#10b981',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Liftori needs photo access so you can attach images to chats, bug reports, and client records.',
        cameraPermission:
          'Liftori uses the camera for video calls and on-the-spot lead capture photos.',
      },
    ],
    [
      'expo-av',
      {
        microphonePermission:
          'Liftori uses the microphone for video calls and voice notes.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: {
      projectId: 'b6c52b3d-9864-4839-b480-49cb95d5e354',
    },
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
});
