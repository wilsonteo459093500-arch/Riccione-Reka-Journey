/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        terra: { DEFAULT: '#B5623A', soft: '#F6E6DC', dark: '#934C2B' },
        pine: { DEFAULT: '#2F4A3C', soft: '#E3EAE4' },
        cream: { DEFAULT: '#F8F4EB', deep: '#F1EBDE' },
        ink: { DEFAULT: '#2B2A27', soft: '#55524B', mute: '#8A857C', faint: '#B3ACA0' },
        line: { DEFAULT: '#E4DCCB', soft: '#EFE9DC' },
        pass: '#3F7A4F',
        fail: '#B8452F',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Noto Sans SC"', '"Noto Sans CJK SC"', '"Microsoft YaHei"', 'Roboto', 'sans-serif'],
        serif: ['"Cormorant Garamond"', '"Noto Serif SC"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
