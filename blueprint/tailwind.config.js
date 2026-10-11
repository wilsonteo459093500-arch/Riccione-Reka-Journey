/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Noto Serif SC"', 'Georgia', 'serif'],
        serif: ['"Noto Serif SC"', '"Source Han Serif CN"', 'Georgia', 'serif'],
        sans: ['Outfit', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Blueprint 品牌色 —— 与提案 PPT 同一套（奶油底 / 深咖 / 金棕）
        bp: {
          paper: '#F5F0E6',
          card: '#FFFFFF',
          tint: '#FAF7F1',
          ink: '#241C12',
          dark: '#211A12',
          muted: '#6E6353',
          faint: '#9A8F7D',
          line: '#DDD2BE',
          rule: '#B8A98E',
          eyebrow: '#8A6844',
          gold: '#B8995A',
          light: '#F2ECE0',
          warn: '#C0843A',
          danger: '#9C3D2E',
          green: '#3D5A4A',
        },
      },
    },
  },
  plugins: [],
};
