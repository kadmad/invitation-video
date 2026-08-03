/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
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
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'fade-out': 'fadeOut 0.2s ease-out forwards',
        'scale-out': 'scaleOut 0.2s ease-out forwards',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
