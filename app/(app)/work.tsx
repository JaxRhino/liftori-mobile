/**
 * Work tab — the team member's "everything assigned to me" board.
 *
 * Wave 0 stub. Later this aggregates:
 *   • Consulting engagements I own
 *   • Custom build projects I PM
 *   • Open tester tasks I claimed
 *   • Operations jobs assigned to me
 *   • L10 scorecards to fill
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Briefcase } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/EmptyState';
import { colors, spacing } from '@/lib/theme';

export default function WorkScreen() {
  return (
    <SafeScreen bottom="skip">
      <Header title="Work" subtitle="Everything assigned to you" />
      <View style={styles.body}>
        <EmptyState
          icon={<Briefcase size={28} color={colors.textSecondary} />}
          title="No work yet"
          description="Consulting engagements, custom builds, tester tasks, and ops jobs assigned to you will appear here as the Hubs come online."
        />
        <Text style={styles.note}>Shipping in Wave 5 · Sales Hub</Text>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xxxl,
  },
  note: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
});
