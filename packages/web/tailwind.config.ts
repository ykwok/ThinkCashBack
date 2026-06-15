import type { Config } from 'tailwindcss';

const config: Config = {
  // System preference drives dark mode so we never hardcode colors.
  darkMode: 'media',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
