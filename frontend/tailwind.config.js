/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E6F4FF',
          100: '#BAE0FF',
          200: '#91CAFF',
          300: '#69B1FF',
          400: '#4096FF',
          500: '#1677FF',
          600: '#0958D9',
          700: '#003EB3',
          800: '#002C8C',
          900: '#001D66',
        },
        navy: {
          DEFAULT: '#172B4D',
          dark: '#091E42',
          light: '#253858',
        },
        slateText: {
          primary: '#172B4D',
          secondary: '#6B778C',
          muted: '#8993A4',
        },
        appBg: {
          layout: '#F5F7FA',
          container: '#FFFFFF',
          secondary: '#FAFBFC',
          border: '#DFE1E6',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
        hover: '0 4px 12px rgba(0, 0, 0, 0.08)',
        modal: '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
}
