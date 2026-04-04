/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aman: '#22C55E',
        waspada: '#F59E0B',
        bahaya: '#EF4444',
        neutral: '#6B7280',
      },
      fontSize: {
        base: '16px',
      },
    },
  },
  plugins: [],
}
