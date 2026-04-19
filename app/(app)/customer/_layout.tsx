/**
 * Customer stack layout — customer detail screens pushed on top of the
 * tabs with native slide animation. Deep-linking to `/customer/:id`
 * works from the CRM list or a follow-up notification.
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function CustomerStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
