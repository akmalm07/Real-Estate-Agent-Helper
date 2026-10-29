/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'rgb(var(--color-rule) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        ring: 'rgb(var(--color-forest) / <alpha-value>)',
        background: 'rgb(var(--color-paper) / <alpha-value>)',
        foreground: 'rgb(var(--color-ink) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--color-forest) / <alpha-value>)',
          foreground: 'rgb(var(--color-surface) / <alpha-value>)',
          hover: 'rgb(var(--color-forest-deep) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-wash) / <alpha-value>)',
          foreground: 'rgb(var(--color-ink) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-wash) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-sage) / <alpha-value>)',
          foreground: 'rgb(var(--color-forest) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          foreground: 'rgb(var(--color-ink) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--color-error) / <alpha-value>)',
          foreground: '#ffffff',
          subtle: 'rgb(var(--color-error-wash) / <alpha-value>)',
        },
        caution: {
          DEFAULT: 'rgb(var(--color-caution) / <alpha-value>)',
          subtle: 'rgb(var(--color-caution-wash) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius-card)',
        md: 'var(--radius-control)',
        sm: 'var(--radius-small)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        dropdown: '0 4px 16px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
