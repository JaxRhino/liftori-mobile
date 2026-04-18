/**
 * Chat stack layout — channel list at the root, conversation screens pushed
 * on top with the native slide animation.
 *
 * Each channel detail lives at `/chat/[channelId]`, so deep-linking (e.g.
 * from a push notification) lands the user directly inside the thread.
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function ChatStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
