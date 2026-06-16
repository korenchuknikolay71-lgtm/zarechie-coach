/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0e14',
          raised: '#11161f',
          card: '#141a24',
          border: '#1f2733',
        },
        accent: {
          DEFAULT: '#22d3ee',
          dim: '#0e7490',
          soft: 'rgba(34, 211, 238, 0.12)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -20px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(34,211,238,0.4), 0 0 24px -4px rgba(34,211,238,0.5)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
