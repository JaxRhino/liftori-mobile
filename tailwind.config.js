/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette mirrors liftori-admin exactly so design language carries.
        brand: {
          emerald: '#10b981',
          'emerald-dark': '#059669',
          'emerald-light': '#34d399',
          purple: '#a855f7',
          'purple-dark': '#7c3aed',
          amber: '#f59e0b',
          sky: '#0ea5e9',
          rose: '#f43f5e',
        },
        surface: {
          950: '#0a0f1e',
          900: '#0f172a', // primary background
          800: '#1e293b', // card surfaces
          700: '#334155', // raised elements
          600: '#475569', // borders
        },
      },
      fontFamily: {
        sans: ['System'],
        mono: ['Menlo', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        xl: '20px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
};
