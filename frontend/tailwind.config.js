/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0e12',
        surface: '#181a20',
        surface2: '#23262f',
        ink: '#f2f3f5',
        muted: '#9aa0ab',
        accent: '#38bdf8', // sky — used for the ☁️ CLOUD route badge
        purple: '#a855f7', // 🔀 HYBRID / persona
        green: '#34d399', // 🔒 LOCAL route badge
        orange: '#fb923c', // version alerts
        red: '#f87171', // sensitive / errors
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-6px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(168, 85, 247, 0.35)' },
          '50%': { boxShadow: '0 0 0 8px rgba(168, 85, 247, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
        blink: 'blink 1s step-start infinite',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
