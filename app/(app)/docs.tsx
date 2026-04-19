/**
 * Company Docs — org document library.
 *
 * Reads `org_documents` (RLS: org_member_access + super_admin_all).
 * Layout:
 *   Header: "Company Docs" with back + Share/open icon in trailing slot
 *   Search row
 *   Horizontal category chip row (All + 10 categories)
 *   Grouped document list, each row shows file type badge, name,
 *     description, size, last-updated label. Tap → opens detail screen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  FileText,
  FolderOpen,
  GraduationCap,
  Megaphone,
  Shield,
  ShieldCheck,
  Award,
  FileSignature,
  Users,
  DollarSign,
  Scale,
  Search,
  X,
  ChevronRight,
  FileImage,
  FileArchive,
  FileSpreadsheet,
  File as FileIcon,
} from 'lucide-react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { Header } from '@/components/Header';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import * as haptics from '@/lib/haptics';
import {
  DOC_CATEGORIES,
  DocCategory,
  OrgDocument,
  categoryMeta,
  extensionOf,
  formatFileSize,
  formatUpdatedLabel,
  listOrgDocuments,
} from '@/lib/orgDocumentsService';

export default function DocsScreen() {
  const router = useRouter();
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DocCategory | 'all'>('all');

  const load = useCallback(async () => {
    try {
      const rows = await listOrgDocuments({ limit: 500 });
      setDocs(rows);
    } catch (e: any) {
      console.warn('[docs] list failed', e);
      Alert.alert('Could not load documents', e?.message ?? '');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (!q) return true;
      const hay = `${d.name} ${d.description ?? ''} ${(d.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [docs, search, category]);

  // Count by category for chip badges
  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = { all: docs.length };
    DOC_CATEGORIES.forEach((c) => { map[c.key] = 0; });
    docs.forEach((d) => {
      map[d.category] = (map[d.category] || 0) + 1;
    });
    return map;
  }, [docs]);

  return (
    <SafeScreen>
      <Header
        title="Company Docs"
        subtitle={`${docs.length} document${docs.length === 1 ? '' : 's'}`}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.emerald} />
        </View>
      ) : (
        <>
          {/* Search */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search documents"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={10}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <CategoryChip
              label={`All · ${countsByCategory.all}`}
              active={category === 'all'}
              onPress={() => setCategory('all')}
              accent={colors.textPrimary}
            />
            {DOC_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.key}
                label={`${c.label} · ${countsByCategory[c.key] ?? 0}`}
                active={category === c.key}
                onPress={() => setCategory(c.key)}
                accent={c.hex}
              />
            ))}
          </ScrollView>

          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={colors.emerald}
              />
            }
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon={<FolderOpen size={28} color={colors.textSecondary} />}
                title={docs.length === 0 ? 'No documents yet' : 'No matches'}
                description={
                  docs.length === 0
                    ? 'Documents uploaded via the web admin will appear here.'
                    : 'Try adjusting your search or filter.'
                }
              />
            ) : (
              filtered.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  onPress={() => {
                    haptics.tap();
                    router.push(`/doc/${d.id}` as any);
                  }}
                />
              ))
            )}
          </ScrollView>
        </>
      )}
    </SafeScreen>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Row
// ═══════════════════════════════════════════════════════════════════════

function DocRow({ doc, onPress }: { doc: OrgDocument; onPress: () => void }) {
  const cat = categoryMeta(doc.category);
  const Icon = iconForDoc(doc);
  return (
    <Card onPress={onPress} accent={cat.hex} style={{ marginBottom: spacing.sm }}>
      <View style={styles.rowTop}>
        <View style={[styles.docIconWrap, { backgroundColor: cat.hex + '22', borderColor: cat.hex }]}>
          <Icon size={18} color={cat.hex} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={2}>{doc.name}</Text>
          {doc.description ? (
            <Text style={styles.rowDesc} numberOfLines={2}>{doc.description}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={[styles.catPill, { borderColor: cat.hex, backgroundColor: cat.hex + '22' }]}>
              <Text style={[styles.catPillText, { color: cat.hex }]}>{cat.label}</Text>
            </View>
            <Text style={styles.metaText}>{formatFileSize(doc.file_size)}</Text>
            <Text style={styles.metaText}>·</Text>
            <Text style={styles.metaText}>{formatUpdatedLabel(doc.updated_at)}</Text>
          </View>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

function iconForDoc(doc: OrgDocument) {
  const ext = extensionOf(doc);
  if (['pdf'].includes(ext)) return FileText;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return FileImage;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
  if (['xlsx', 'xls', 'csv', 'numbers'].includes(ext)) return FileSpreadsheet;
  return FileIcon;
}

// Kept for future use (category icon resolution if we decide to swap in lucide icons)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function categoryIconFor(meta: ReturnType<typeof categoryMeta>) {
  switch (meta.icon) {
    case 'graduation-cap': return GraduationCap;
    case 'megaphone': return Megaphone;
    case 'shield-check': return ShieldCheck;
    case 'shield': return Shield;
    case 'award': return Award;
    case 'file-signature': return FileSignature;
    case 'users': return Users;
    case 'dollar-sign': return DollarSign;
    case 'scale': return Scale;
    default: return FileText;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Category chip
// ═══════════════════════════════════════════════════════════════════════

function CategoryChip({
  label,
  active,
  onPress,
  accent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[
        styles.chip,
        active && { backgroundColor: accent + '22', borderColor: accent },
      ]}
    >
      <Text style={[styles.chipText, active && { color: accent, fontWeight: '700' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },

  searchRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: { flex: 1, color: colors.textPrimary, ...typography.body },

  chipRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  docIconWrap: {
    width: 44, height: 44,
    borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  rowName: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' },
  rowDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  catPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  catPillText: { ...typography.micro, fontWeight: '700' },
  metaText: { ...typography.caption, color: colors.textSecondary },
});
