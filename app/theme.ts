export type Theme = 'light' | 'dark';

/**
 * The page background for each theme, mirrored into `<meta name="theme-color">`.
 *
 * That meta is what colours the system bar: the status bar in an installed
 * app, the address bar in a browser tab. Left fixed it reads as a stripe in
 * some other app's colour pinned above this one — most obvious on a dark
 * theme, where a bright bar sits over a black page.
 *
 * The values are the body's own background (`bg-white` / `dark:bg-neutral-900`
 * in the root layout), so the bar disappears into the page rather than framing
 * it. Keep them in step if that background changes.
 *
 * Deliberately *not* a `prefers-color-scheme` media query on the meta tag:
 * that would follow the OS, and this app follows the theme the user picked —
 * the same reason `globals.css` pins `color-scheme` rather than accepting
 * `light dark`.
 */
export const THEME_COLORS: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#171717',
};

/**
 * Point the system bar at the applied theme.
 *
 * Creates the tag if it isn't there — the pre-paint script runs before any
 * metadata React might render, and owning it here means exactly one tag with
 * one writer, rather than racing whatever the framework emits.
 */
export function applyThemeColor(theme: Theme): void {
  if (typeof document === 'undefined') return;
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
