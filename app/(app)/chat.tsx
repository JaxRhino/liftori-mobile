/**
 * Chat tab — team channels + DMs + client channels.
 *
 * Wave 0 stub. Wave 2 brings the full Slack-style experience:
 *   • Internal channels (general, dev, clients)
 *   • Client DM channels (channel_type = 'client_dm')
 *   • Typing indicators, read receipts
 *   • Message composer with upload + emoji
 *   • Push notifications on new messages
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/EmptyState';
import { colors, spacing } from '@/lib/theme';

export default function ChatScreen() {
  return (
    <SafeScreen bottom="skip">
      <Header title="Chat" subtitle="Team & client conversations" />
      <View style={styles.body}>
        <EmptyState
          icon={<MessageCircle size={28} color={colors.textSecondary} />}
          title="Chat is coming next"
          description="Internal channels, client DMs, typing indicators, and push notifications land in Wave 2."
        />
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
});
