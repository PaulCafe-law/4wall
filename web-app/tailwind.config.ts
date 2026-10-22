import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chrome: {
          950: 'var(--chrome-950)',
          900: 'var(--chrome-900)',
          800: 'var(--chrome-800)',
          700: 'var(--chrome-700)',
          500: 'var(--chrome-500)',
          300: 'var(--chrome-300)',
          200: 'var(--chrome-200)',
          100: 'var(--chrome-100)',
          50: 'var(--chrome-50)',
        },
        ember: {
          500: 'var(--ember-500)',
          400: 'var(--ember-400)',
          300: 'var(--ember-300)',
        },
        moss: {
          500: 'var(--moss-500)',
          400: 'var(--moss-400)',
          300: 'var(--moss-300)',
        },
        signal: {
          red: 'var(--signal-red)',
          amber: 'var(--signal-amber)',
          green: 'var(--signal-green)',
        },
        // Warehouse-system palette, used only by the platform login surface
        // (docs/platform-login-warehouse-restyle.md).
        warehouse: {
          ink: '#111111',
          muted: '#6b7280',
          line: '#e5e7eb',
          'line-strong': '#d6dadf',
          grid: '#f1f3f5',
          teal: '#08766c',
          'teal-strong': '#065f57',
          'teal-soft': '#e6f2f0',
          warn: '#b45309',
          'warn-soft': '#fff7ed',
          danger: '#a63d2c',
          'danger-soft': '#fff5f2',
        },
      },
      boxShadow: {
        panel: '0 24px 80px rgba(7, 10, 15, 0.14)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI Variable"', 'sans-serif'],
        display: ['"Space Grotesk"', '"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Cascadia Code"', 'monospace'],
        warehouse: ['Inter', '"Noto Sans TC"', '"Microsoft JhengHei"', 'sans-serif'],
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at top left, rgba(191, 115, 42, 0.18), transparent 30%), radial-gradient(circle at 85% 15%, rgba(38, 78, 68, 0.18), transparent 25%), linear-gradient(180deg, rgba(255,255,255,0.7), rgba(232,236,240,0.92))',
      },
    },
  },
  plugins: [],
} satisfies Config
