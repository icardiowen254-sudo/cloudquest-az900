/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: '#163300', 600: '#24470f', 100: '#dbe7d1' },
        lime: { DEFAULT: '#9fe870', soft: '#e3f7d2' },
        sand: '#e4e4df',
        canvas: '#e8efe9',
        mist: '#eef0e8',
        gold: { DEFAULT: '#d4a61f', soft: '#f5e7b8' },
        ink: '#17270c',
        muted: '#5c6b51',
        danger: '#b42318',
      },
      fontFamily: { sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      borderRadius: { '4xl': '2rem' },
      boxShadow: { card: '0 1px 2px rgba(22,51,0,.05), 0 10px 28px -14px rgba(22,51,0,.25)' },
    },
  },
  plugins: [],
};
