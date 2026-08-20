/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens — CSS variables defined in src/index.css
        // (:root for light, .dark for dark). Use these instead of raw
        // bg-white/text-slate-*/border-slate-* so components respond to
        // the theme toggle automatically.
        page: 'rgb(var(--c-page) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-alt': 'rgb(var(--c-surface-alt) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted) / <alpha-value>)',
        edge: 'rgb(var(--c-edge) / <alpha-value>)',
        primary: {
          50: '#eef2fe',
          100: '#dfe7fd',
          200: '#c5d2fc',
          300: '#a3b8f9',
          400: '#7f9af5',
          500: '#4f6ef7',
          600: '#3b54e0',
          700: '#2f43c4',
          800: '#2a399f',
          900: '#27347e',
          950: '#1a204d',
        },
        accent: {
          50: '#ecfdf7',
          100: '#d1fae9',
          200: '#a7f3d7',
          300: '#6ee7bf',
          400: '#34d5a3',
          500: '#0dcfa6',
          600: '#04a882',
          700: '#03876b',
          800: '#056a56',
          900: '#055748',
          950: '#02312a',
        },
        // Landing-page gold/ink palette — used on all audience-facing screens
        // (nav, footer, storefront, editor) so buttons/links match the hero theme.
        brand: {
          50: '#F6EFE1',
          100: '#F1E4CC',
          200: '#E9D6B0',
          300: '#DCC28A',
          400: '#C9A15E',
          500: '#B98D4C',
          600: '#8B6F47',
          700: '#6B5738',
          800: '#4A3B26',
          900: '#3A322B',
          950: '#2A2420',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        scaleOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.95)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.15', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        sliceIn: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'fade-out': 'fadeOut 0.2s ease-out forwards',
        'scale-out': 'scaleOut 0.2s ease-out forwards',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'shimmer-slow': 'shimmer 3.5s linear infinite',
        'twinkle': 'twinkle 2.4s ease-in-out infinite',
        'slice-in': 'sliceIn 280ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
