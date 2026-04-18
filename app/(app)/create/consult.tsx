/**
 * /create/consult — Consulting Discovery wizard.
 *
 * Wave 1b stub. Ships as a placeholder so the Create hub tile doesn't dead-end;
 * full wizard lands when Wave 1b runs.
 */
import React from 'react';
import { HandCoins } from 'lucide-react-native';
import ComingSoonWizard from './_ComingSoon';
import { colors } from '@/lib/theme';

export default function ConsultWizard() {
  return (
    <ComingSoonWizard
      title="Consulting Discovery"
      subtitle="Wave 1b — shipping soon."
      accent={colors.sky}
      icon={<HandCoins size={28} color={colors.sky} />}
      body="This flow will schedule a discovery call and open a consulting engagement with the right package tier and 1099 assignee."
    />
  );
}
