import type { Config } from 'tailwindcss';

/**
 * Theme tokens, surfaced as ordinary colour utilities.
 *
 * `bg-surface` and `text-muted` rather than `bg-[var(--surface)]`: the class
 * names stay readable, and — more importantly — a colour written this way has
 * no light/dark half to keep in step. One class, and the theme decides.
 *
 * The values live in `app/globals.css`, redeclared per theme. `darkMode:
 * 'class'` stays while the existing `dark:` variants are migrated; they and
 * the tokens describe the same colours, so the two can coexist.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Structure */
        page: 'var(--page)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-soft': 'var(--surface-soft)',
        'surface-hover': 'var(--surface-hover)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',

        /* Foreground */
        fg: 'var(--fg)',
        'fg-strong': 'var(--fg-strong)',
        'fg-muted': 'var(--fg-muted)',
        'fg-faint': 'var(--fg-faint)',

        /* Accent */
        accent: 'var(--accent)',
        'accent-fill': 'var(--accent-fill)',
        'accent-line': 'var(--accent-line)',
        'on-accent': 'var(--on-accent)',

        /* States */
        danger: 'var(--danger)',
        'danger-fill': 'var(--danger-fill)',
        'danger-line': 'var(--danger-line)',
        warn: 'var(--warn)',
        'warn-fill': 'var(--warn-fill)',
        'warn-line': 'var(--warn-line)',
      },
    },
  },
  plugins: [],
};

export default config;
