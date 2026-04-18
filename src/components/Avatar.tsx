/**
 * Avatar — shows a user's image or initial-based fallback with brand-consistent
 * deterministic colors. Matches the web dashboard's avatar treatment.
 */
import React, { useMemo } from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii } from '@/lib/theme';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  name?: string | null;
  url?: string | null;
  size?: Size | number;
  /** Optional outline ring (e.g., emerald for active). */
  ring?: string;
  style?: StyleProp<ViewStyle>;
}

const PALETTE = [
  colors.emerald,
  colors.purple,
  colors.amber,
  colors.sky,
  colors.rose,
  colors.indigo,
];

function hashToColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const idx = Math.abs(h) % PALETTE.length;
  return PALETTE[idx];
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_MAP: Record<Size, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 72,
};

export function Avatar({ name, url, size = 'md', ring, style }: AvatarProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size];
  const bg = useMemo(() => hashToColor(name ?? 'liftori'), [name]);
  const ini = useMemo(() => initials(name), [name]);

  const dim: ViewStyle = {
    width: pixelSize,
    height: pixelSize,
    borderRadius: pixelSize / 2,
  };

  return (
    <View
      style={[
        styles.container,
        dim,
        ring ? { borderWidth: 2, borderColor: ring } : null,
        style,
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={[dim, styles.image]} resizeMode="cover" />
      ) : (
        <View style={[styles.fallback, dim, { backgroundColor: bg }]}>
          <Text
            style={[
              styles.initials,
              { fontSize: Math.max(10, pixelSize * 0.4) },
            ]}
          >
            {ini}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.surface800,
  },
  image: { width: '100%', height: '100%' },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.textOnAccent,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
