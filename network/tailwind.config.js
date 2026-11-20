/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"PingFang SC"', '"Noto Sans SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#1C1917',
        paper: '#F7F5F0',
        line: '#E7E2D8',
        muted: '#6B645A',
        faint: '#A39B8E',
        plum: { DEFAULT: '#22A55B', deep: '#15803D' }, // Sims 的绿菱形
        danger: '#B91C1C',
      },
    },
  },
  plugins: [],
};
