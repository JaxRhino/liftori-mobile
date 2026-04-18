/**
 * /create — stack for the quick-capture wizards.
 *
 * The tile menu lives at /create (index), and each wizard is a pushed screen
 * with its own header. We hide the default header and let each wizard draw
 * its own chrome via the WizardShell component.
 */
import React from 'react';
import { Stack } from 'expo-router';

export default function CreateStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
