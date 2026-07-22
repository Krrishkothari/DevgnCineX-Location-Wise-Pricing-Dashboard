/** @type {import('tailwindcss').Config} */

// Colours are driven by CSS custom properties defined in index.css so the same
// class names work in both themes. `<alpha-value>` keeps Tailwind's opacity
// modifiers (e.g. `bg-surface/50`) working against the variables.
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: withAlpha('--c-canvas'),
        surface: withAlpha('--c-surface'),
        elevated: withAlpha('--c-elevated'),
        line: withAlpha('--c-line'),
        strong: withAlpha('--c-strong'),

        ink: withAlpha('--c-ink'),
        'ink-soft': withAlpha('--c-ink-soft'),
        'ink-muted': withAlpha('--c-ink-muted'),

        brand: withAlpha('--c-brand'),
        'brand-soft': withAlpha('--c-brand-soft'),
        above: withAlpha('--c-above'),
        below: withAlpha('--c-below'),
        warn: withAlpha('--c-warn'),
        info: withAlpha('--c-info'),
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Previously `font-mono` was used for every price but no mono family was
        // configured, so numbers fell back to the browser default.
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        control: '12px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.20), 0 8px 24px -12px rgb(0 0 0 / 0.45)',
        lift: '0 2px 4px rgb(0 0 0 / 0.20), 0 16px 40px -16px rgb(0 0 0 / 0.55)',
        glow: '0 0 0 1px rgb(var(--c-brand) / 0.35), 0 0 32px -6px rgb(var(--c-brand) / 0.45)',
      },
      // The old config referenced `animate-shimmer` and `animate-pulse-slow`
      // without ever defining them, so both classes silently did nothing.
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(3%, -4%, 0) scale(1.08)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s infinite',
        'pulse-slow': 'pulse-slow 2.4s ease-in-out infinite',
        'fade-up': 'fade-up 0.35s ease-out both',
        drift: 'drift 24s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
