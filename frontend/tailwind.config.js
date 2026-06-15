/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- CorpusAgent cinematic design system ---
        bg: '#020408', // --bg-primary
        surface: '#0a0f1a', // --bg-surface
        card: '#111827', // --bg-card
        'card-hover': '#1a2235', // --bg-card-hover
        blue: '#3b82f6', // --accent-blue
        cyan: '#06b6d4', // --accent-cyan
        purple: '#8b5cf6', // --accent-purple
        green: '#10b981', // --accent-green
        orange: '#f59e0b', // --accent-orange
        red: '#ef4444', // --accent-red
        ink: '#f1f5f9', // --text-primary
        muted: '#64748b', // --text-muted
        // legacy aliases (keep older class names valid)
        surface2: '#1a2235',
        accent: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(59,130,246,0.4)',
        'glow-cyan': '0 0 20px rgba(6,182,212,0.4)',
        'glow-purple': '0 0 20px rgba(139,92,246,0.4)',
        'glow-green': '0 0 20px rgba(16,185,129,0.4)',
        'glow-orange': '0 0 20px rgba(245,158,11,0.4)',
        'glow-red': '0 0 20px rgba(239,68,68,0.4)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(60px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(59,130,246,0.5)' },
          '70%': { boxShadow: '0 0 0 10px rgba(59,130,246,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'bounce-dot': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'glow-breathe': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'slide-up': 'slide-up 0.45s cubic-bezier(0.22,1,0.36,1) both',
        blink: 'blink 1s step-start infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'spin-slow': 'spin-slow 8s linear infinite',
        'bounce-dot': 'bounce-dot 1.2s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 5s ease-in-out infinite',
        'glow-breathe': 'glow-breathe 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
