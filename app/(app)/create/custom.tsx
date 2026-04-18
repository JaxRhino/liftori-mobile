/**
 * /create/custom — Custom Build Brief wizard.
 *
 * Wave 1c stub — the full wizard lands in Wave 1c. Captures a one-liner
 * brief, tier, and budget to seed a custom-build sales lead.
 */
import React from 'react';
import { Hammer } from 'lucide-react-native';
import ComingSoonWizard from './_ComingSoon';
import { colors } from '@/lib/theme';

export default function CustomBuildWizard() {
  return (
    <ComingSoonWizard
      title="Custom Build Brief"
      subtitle="Wave 1c — shipping soon."
      accent={colors.purple}
      icon={<Hammer size={28} color={colors.purple} />}
      body="Capture a custom-build prospect from the field: one-liner brief, tier (Starter / Growth / Scale), timeline, and budget. Drops straight into the custom_build pipeline."
    />
  );
}
