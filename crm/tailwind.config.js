/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Sail brand palette — kept as CSS-readable hex names so existing
        // `bg-[#xxx]` class usage in components keeps working unchanged.
        sail: {
          paper: '#F5F1EA',
          card: '#FFFFFF',
          ink: '#1A1614',
          muted: '#6B6358',
          faint: '#9A8F7E',
          line: '#E8E2D7',
          tint: '#FAF7F2',
          green: '#3D5A4A',
          'green-deep': '#2D4A3E',
          brown: '#A87C4F',
          gold: '#B8995A',
          warn: '#C0843A',
          danger: '#9C3D2E',
        },
      },
    },
  },
  plugins: [],
};
