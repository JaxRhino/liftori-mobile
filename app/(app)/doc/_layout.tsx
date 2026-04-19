/**
 * Doc stack layout — company document detail viewer pushed above tabs.
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function DocStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
