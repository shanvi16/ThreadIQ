/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F4EE',
        surface: '#FDFCFA',
        ink: { DEFAULT: '#2A2A28', soft: '#4A4945' },
        muted: '#6B6A64',
        line: { DEFAULT: '#E6E1D7', strong: '#D3CCBD' },
        sage: {
          50: '#F1F4EF',
          100: '#E1E8DD',
          200: '#C6D3BF',
          300: '#A5B89C',
          400: '#869E7B',
          500: '#6B8561',
          600: '#556C4D',
          700: '#44563E',
          800: '#364432',
        },
        clay: { 50: '#FBF1EC', 100: '#F4DDD1', 600: '#A9553A', 700: '#8A4430' },
        amber: { 50: '#FBF5E6', 100: '#F4E6BF', 700: '#8A6410' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(42,42,40,0.04)',
        pop: '0 12px 32px rgba(42,42,40,0.16)',
      },
    },
  },
  plugins: [],
};
