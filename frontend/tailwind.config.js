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
        border: '#e5e7eb',
        input: '#e5e7eb',
        ring: '#4f46e5',
        background: '#ffffff',
        foreground: '#0f172a',
        primary: {
          DEFAULT: '#4f46e5',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#f9fafb',
          foreground: '#0f172a',
        },
        muted: {
          DEFAULT: '#f9fafb',
          foreground: '#94a3b8',
        },
        accent: {
          DEFAULT: '#eef2ff',
          foreground: '#4f46e5',
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#0f172a',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
      },
      borderRadius: {
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        dropdown: '0 4px 16px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
