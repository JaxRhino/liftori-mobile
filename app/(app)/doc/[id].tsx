/**
 * Document detail — view metadata + open/share file.
 *
 * OTA-safe implementation: we don't embed a PDF viewer natively. Instead:
 *   - Image files render inline via expo-image
 *   - Everything else → "Open document" button uses Linking.openURL on
 *     the file_url (system browser handles PDF/DOC/XLSX/etc.)
 *
 * Users can copy the URL for sharing. Admin users can delete a document.
 *
 * Once react-native-webview or expo-web-browser is added in a future native
 * build, we can upgrade this screen to embed the PDF viewer in-app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import {
  ExternalLink,
  Copy,
  Download,
  Share2,
  Trash2,
  Tag,
  Eye,
  FileText,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  OrgDocument,
  categoryMeta,
  deleteOrgDocument,
  extensionOf,
  fetchOrgDocument,
  formatFileSize,
  formatUpdatedLabel,
  isImage,
  isPdf,
} from '@/lib/orgDocumentsService';
import { useAuth } from '@/lib/AuthContext';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, isFounder } = useAuth();

  const [doc, setDoc] = useState<OrgDocument | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await fetchOrgDocument(id);
      setDoc(d);
    } catch (e: any) {
      Alert.alert('Could not load document', e?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleOpen = async () => {
    if (!doc?.file_url) {
      Alert.alert('No file attached', 'This document has no file URL.');
      return;
    }
    try {
      haptics.bump();
      const supported = await Linking.canOpenURL(doc.file_url);
      if (!supported) {
        Alert.alert('Cannot open', 'No app is available to open this URL.');
        return;
      }
      await Linking.openURL(doc.file_url);
    } catch (e: any) {
      Alert.alert('Could not open', e?.message ?? '');
    }
  };

  const handleCopy = async () => {
    if (!doc?.file_url) return;
    try {
      await Clipboard.setStringAsync(doc.file_url);
      haptics.select();
      Alert.alert('Copied', 'Document URL copied to clipboard.');
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (!doc?.file_url) return;
    try {
      await Share.share({
        message: `${doc.name}\n${doc.file_url}`,
        url: doc.file_url,
        title: doc.name,
      });
    } catch {
      // ignore user cancel
    }
  };

  const handleDelete = () => {
    if (!doc) return;
    Alert.alert(
      'Delete document?',
      `This will permanently remove "${doc.name}" from the library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOrgDocument(doc.id);
              router.back();
            } catch (e: any) {
              Alert.alert('Could not delete', e?.message ?? '');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeScreen>
        <Header title="Document" onBack={() => router.back()} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.emerald} />
        </View>
      </SafeScreen>
    );
  }

  if (!doc) {
    return (
      <SafeScreen>
        <Header title="Document" onBack={() => router.back()} />
        <EmptyState
          icon={<FileText size={28} color={colors.textSecondary} />}
          title="Document not found"
          description="It may have been removed from the library."
          action={<Button label="Go back" variant="secondary" onPress={() => router.back()} />}
        />
      </SafeScreen>
    );
  }

  const cat = categoryMeta(doc.category);
  const ext = extensionOf(doc);
  const canDelete = isAdmin || isFounder;

  return (
    <SafeScreen>
      <Header
        title={doc.name}
        subtitle={cat.label}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {/* Preview or placeholder */}
        <Card accent={cat.hex} style={{ marginBottom: spacing.md, padding: 0 }} padded={false}>
          <View style={styles.previewWrap}>
            {doc.file_url && isImage(doc) ? (
              <Image
                source={{ uri: doc.file_url }}
                style={styles.previewImage}
                contentFit="contain"
                transition={200}
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <FileText size={56} color={cat.hex} />
                <Text style={styles.previewExt}>
                  {ext ? ext.toUpperCase() : 'FILE'}
                </Text>
                {isPdf(doc) ? (
                  <Text style={styles.previewHint}>
                    Tap &quot;Open document&quot; to view this PDF in your browser.
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </Card>

        {/* Primary action */}
        <View style={styles.primaryActions}>
          <Button
            label="Open document"
            variant="primary"
            size="lg"
            icon={<ExternalLink size={16} color={colors.textOnAccent} />}
            onPress={handleOpen}
            disabled={!doc.file_url}
            style={{ flex: 1 }}
          />
        </View>

        <View style={styles.secondaryActions}>
          <Pressable onPress={handleShare} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
            <Share2 size={16} color={colors.textPrimary} />
            <Text style={styles.iconActionText}>Share</Text>
          </Pressable>
          <Pressable onPress={handleCopy} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
            <Copy size={16} color={colors.textPrimary} />
            <Text style={styles.iconActionText}>Copy link</Text>
          </Pressable>
          <Pressable onPress={handleOpen} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
            <Download size={16} color={colors.textPrimary} />
            <Text style={styles.iconActionText}>Download</Text>
          </Pressable>
        </View>

        {/* Description */}
        {doc.description ? (
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descBody}>{doc.description}</Text>
          </Card>
        ) : null}

        {/* Metadata */}
        <Card style={{ marginBottom: spacing.md }}>
          <InfoRow label="Category" value={cat.label} />
          <InfoRow label="File type" value={ext ? ext.toUpperCase() : '—'} />
          <InfoRow label="Size" value={formatFileSize(doc.file_size)} />
          <InfoRow label="Visibility" value={doc.visibility} />
          <InfoRow label="Updated" value={formatUpdatedLabel(doc.updated_at)} last />
        </Card>

        {/* Tags */}
        {doc.tags.length > 0 ? (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.tagHeader}>
              <Tag size={14} color={colors.textSecondary} />
              <Text style={styles.sectionTitle}>Tags</Text>
            </View>
            <View style={styles.tagRow}>
              {doc.tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Delete (admin only) */}
        {canDelete ? (
          <View style={styles.dangerZone}>
            <Button
              label="Delete document"
              variant="destructive"
              size="md"
              icon={<Trash2 size={14} color={colors.textOnAccent} />}
              onPress={handleDelete}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeScreen>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  pressed: { opacity: 0.6 },

  previewWrap: {
    height: 240,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface800,
  },
  previewImage: { width: '100%', height: '100%' },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  previewExt: {
    ...typography.h3,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  previewHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },

  primaryActions: { marginBottom: spacing.md },

  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  iconAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  iconActionText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },

  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  descBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: { ...typography.caption, color: colors.textSecondary, width: 90 },
  infoValue: { ...typography.body, color: colors.textPrimary, flex: 1, textTransform: 'capitalize' },

  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },

  dangerZone: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
