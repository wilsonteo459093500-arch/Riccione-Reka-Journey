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
        // PUMM ROUNDTABLE palette — ink-blue table felt + brass.
        // Deliberately distinct from the Sail apps' green so the two
        // never get confused when both are open on the same laptop.
        pumm: {
          paper: '#F6F4EF',
          card: '#FFFFFF',
          ink: '#17181A',
          muted: '#585B60',
          faint: '#7C8087',
          line: '#E1DDD4',
          tint: '#FBFAF7',
          brand: '#23303D',
          'brand-deep': '#16212B',
          brass: '#B08D4F',
          gold: '#C9A961',
          ok: '#3F7D5C',
          warn: '#C0843A',
          danger: '#9C3D2E',
        },
      },
    },
  },
  plugins: [],
};
