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
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Impact', 'sans-serif'],
        cond: ['"Barlow Condensed"', 'sans-serif'],
        body: ['"Work Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
