import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12151a',
        panel: '#171b21',
        paper: '#f5f1e6',
        paperdim: '#e7e1d0',
        line: '#22272f',
        citrus: '#c7e05a',
        protein: '#5b8fc9',
        carbs: '#e6a83e',
        fat: '#c76a5a',
        muted: '#8b93a1',

        // Rainbow palette for the premium AI dashboard experience.
        coral: '#ff6b6b',
        sunset: '#ff9f4a',
        sun: '#ffd15c',
        lime: '#b7e858',
        mint: '#4ade9a',
        turquoise: '#3ee8c7',
        cyan: '#3fd0ff',
        sky: '#4f9dff',
        indigo: '#7c6bff',
        violet: '#b45bff',
        bubblegum: '#ff5cb8',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Impact', 'sans-serif'],
        cond: ['"Barlow Condensed"', 'sans-serif'],
        body: ['"Work Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
        glass: '28px',
      },
      backgroundImage: {
        'aurora-mesh':
          'radial-gradient(at 15% 10%, rgba(255,107,107,0.35) 0px, transparent 55%), radial-gradient(at 85% 0%, rgba(124,107,255,0.32) 0px, transparent 50%), radial-gradient(at 0% 70%, rgba(63,208,255,0.30) 0px, transparent 55%), radial-gradient(at 90% 85%, rgba(74,222,154,0.28) 0px, transparent 55%), radial-gradient(at 50% 50%, rgba(255,209,92,0.18) 0px, transparent 60%)',
        'ring-rainbow':
          'conic-gradient(from 0deg, #ff6b6b, #ff9f4a, #ffd15c, #b7e858, #4ade9a, #3ee8c7, #3fd0ff, #4f9dff, #7c6bff, #b45bff, #ff5cb8, #ff6b6b)',
        'orb-rainbow': 'linear-gradient(135deg, #ff6b6b, #ffd15c, #4ade9a, #3fd0ff, #7c6bff, #ff5cb8)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.015)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        spinSlowReverse: {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.08)' },
        },
      },
      animation: {
        breathe: 'breathe 5s ease-in-out infinite',
        float: 'float 4.5s ease-in-out infinite',
        'spin-slow': 'spinSlow 14s linear infinite',
        'spin-slow-reverse': 'spinSlowReverse 18s linear infinite',
        'glow-pulse': 'glowPulse 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
