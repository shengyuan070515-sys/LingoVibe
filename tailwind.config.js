import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        headline: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        stitch: {
          surface: '#f9f9ff',
          sidebar: '#f0f3ff',
          primary: '#004ac6',
          secondary: '#006c4a',
          tertiary: '#6a1edb',
          'on-surface': '#151c27',
          'on-surface-variant': '#434655',
          'surface-container-low': '#f0f3ff',
          'surface-container-lowest': '#ffffff',
          'surface-container-high': '#e2e8f8',
          'surface-container-highest': '#dce2f3',
          'primary-fixed': '#dbe1ff',
          'secondary-container': '#82f5c1',
          'on-secondary-container': '#00714e',
          'tertiary-fixed': '#eaddff',
          'tertiary-fixed-dim': '#d2bbff',
          'on-tertiary-fixed': '#25005a',
          outline: '#737686',
        },
      },
      boxShadow: {
        'stitch-card': '0 12px 40px rgba(21,28,39,0.04)',
        'stitch-soft': '0 8px 30px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [typography],
}
