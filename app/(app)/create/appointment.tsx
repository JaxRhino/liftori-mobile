/**
 * /create/appointment — Book an Appointment wizard.
 *
 * Wave 1d stub — full wizard lands in Wave 1d. Will write to the
 * appointments table and optionally push a calendar invite.
 */
import React from 'react';
import { PhoneCall } from 'lucide-react-native';
import ComingSoonWizard from './_ComingSoon';
import { colors } from '@/lib/theme';

export default function AppointmentWizard() {
  return (
    <ComingSoonWizard
      title="Book an Appointment"
      subtitle="Wave 1d — shipping soon."
      accent={colors.amber}
      icon={<PhoneCall size={28} color={colors.amber} />}
      body="Schedule an internal or client meeting, tie it to a lead or project, and drop it onto everyone's calendar without leaving the Liftori app."
    />
  );
}
