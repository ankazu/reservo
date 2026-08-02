import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        moss: 'rgb(var(--color-moss) / <alpha-value>)',
        clay: 'rgb(var(--color-clay) / <alpha-value>)',
        peach: 'rgb(var(--color-peach) / <alpha-value>)',
        sage: 'rgb(var(--color-sage) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        serif: ['Playfair Display', 'serif'],
      },
    },
  },
}
