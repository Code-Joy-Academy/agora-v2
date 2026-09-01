/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        realm: '#1B1830',
        cream: '#F5EEDD',
        slatemid: '#2C2748',
        newnode: '#585F73',
        exploring: '#D9A23D',
        familiar: '#3FA796',
        mastered: '#E0C24C',
        crimson: '#C4453D',
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
