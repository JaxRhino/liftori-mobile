/**
 * Design tokens — single source of truth for colors/spacing/radii.
 * Mirrors liftori-admin (web) so the brand language carries exactly.
 */

export const colors = {
  // Brand accents
  emerald: '#10b981',
  emeraldDark: '#059669',
  emeraldLight: '#34d399',
  purple: '#a855f7',
  purpleDark: '#7c3aed',
  amber: '#f59e0b',
  sky: '#0ea5e9',
  rose: '#f43f5e',
  indigo: '#6366f1',

  // Surfaces (dark theme only for v1)
  bg: '#0a0f1e',
  surface900: '#0f172a',
  surface800: '#1e293b',
  surface700: '#334155',
  surface600: '#475569',

  // Text
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textOnAccent: '#ffffff',

  // Semantic
  success: '#10b981',
  warning: '#f59e0b',
  error: '#f43f5e',
  info: '#0ea5e9',

  // Borders
  border: 'rgba(148, 163, 184, 0.15)',
  borderStrong: 'rgba(148, 163, 184, 0.3)',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  micro: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.3 },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
};
