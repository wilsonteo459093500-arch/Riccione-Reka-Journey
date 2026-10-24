/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Noto Serif SC"', 'Georgia', 'serif'],
        serif: ['"Noto Serif SC"', '"Source Han Serif CN"', 'Georgia', 'serif'],
        sans: ['Outfit', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        round: ['Nunito', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // 溪岸 SAIL 品牌色（与 invite / blueprint 同一套）
        bp: {
          paper: '#F5F0E6',
          tint: '#FAF7F1',
          ink: '#241C12',
          dark: '#211A12',
          muted: '#6E6353',
          faint: '#9A8F7D',
          line: '#DDD2BE',
          gold: '#C08A3E',
          amber: '#E1913F',
          green: '#3D5A4A',
        },
      },
    },
  },
  plugins: [],
};
