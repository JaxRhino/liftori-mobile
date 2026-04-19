/**
 * Assistant stack layout — thread list + conversation detail.
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function AssistantStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
