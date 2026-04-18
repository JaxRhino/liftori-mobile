/**
 * Lead stack layout — lead detail screens pushed on top of the tabs
 * with the native slide animation. Deep-linking from Work, Home, or a
 * push notification lands the user at `/lead/:id` directly.
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function LeadStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
