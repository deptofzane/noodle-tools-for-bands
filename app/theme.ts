export const THEMES = ['light', 'dark', 'sepia'] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

/** How each theme is presented in the picker. */
export const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  sepia: 'Sepia',
};

/**
 * Whether a theme is dark *enough* to keep the `dark` class on.
 *
 * The class is no longer "the theme" — it's the switch for the `dark:`
 * variants still left in the tree. A low-light theme has to keep it on, or
 * every unmigrated colour would render its light value against a dark page.
 * It also drives `color-scheme`, and so the look of native controls.
 */
export const THEME_IS_DARK: Record<Theme, boolean> = {
  light: false,
  dark: true,
  sepia: true,
};

/**
 * The page background per theme, mirrored into `<meta name="theme-color">` so
 * the system bar disappears into the page instead of framing it. Keep in step
 * with `--page` in globals.css.
 */
export const THEME_COLORS: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#171717',
  sepia: '#1c1714',
};

/**
 * Put a theme on the document: the `data-theme` the tokens key off, the
 * `dark` class the remaining variants key off, and the system bar's colour.
 *
 * One function so the three can't drift apart. The pre-paint script in the
 * root layout does the same three things inline, because it has to run before
 * any of this is loaded.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', THEME_IS_DARK[theme]);

  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', THEME_COLORS[theme]);
}
