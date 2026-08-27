export const THEMES = [
  'light',
  'dark',
  'sepia',
  'stage',
  'rose-pine',
  'synthwave-84',
  'catppuccin-latte',
] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

/** How each theme is presented in the picker. */
export const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  'catppuccin-latte': 'Catppuccin Latte',
  dark: 'Dark',
  sepia: 'Sepia',
  stage: 'Stage',
  'rose-pine': 'Rosé Pine',
  'synthwave-84': "SynthWave '84",
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
  stage: true,
  'rose-pine': true,
  'synthwave-84': true,
  // The first light theme besides the default — so the `dark` class comes
  // off, and the variants still awaiting migration correctly render their
  // light values.
  'catppuccin-latte': false,
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
  stage: '#080808',
  'rose-pine': '#191724',
  'synthwave-84': '#262335',
  'catppuccin-latte': '#e6e9ef',
};

/**
 * Put a theme on the document: the `data-theme` the tokens key off, the
 * `dark` class the remaining variants key off, and the system bar's colour.
 *
 * One function so the three can't drift apart. The pre-paint script in the
 * root layout does the same three things inline, because it has to run before
 * any of this is loaded.
 */
export function applyTheme(theme: Theme, override = false): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  /*
   * An override marks the theme as imposed by a screen rather than chosen in
   * Settings — `ThemeKeeper` leaves it alone while it's set, instead of
   * restoring the stored choice and fighting whatever put it there.
   */
  if (override) root.dataset.themeOverride = 'on';
  else delete root.dataset.themeOverride;
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
