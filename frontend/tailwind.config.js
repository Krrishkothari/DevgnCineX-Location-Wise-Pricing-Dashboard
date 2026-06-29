/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        op: {
          bg: '#09090B',
          sidebar: '#0C0C0E',
          card: '#18181B',
          border: '#2A2A2F',
          accent: '#6D5DF6',
          success: '#00D26A',
          danger: '#FF4D67',
          textMain: '#FFFFFF',
          textSecondary: '#A1A1AA',
          muted: '#71717A',
          link: '#818CF8' // Soft Indigo
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
