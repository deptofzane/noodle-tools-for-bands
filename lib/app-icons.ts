/**
 * The app's installable-icon paths, carrying a cache-busting version.
 *
 * These files live at fixed URLs — unlike build assets, nothing content-hashes
 * them — and the service worker claims every image under `static-image-assets`
 * with StaleWhileRevalidate for 30 days (see `defaultCache` in app/sw.ts). So
 * replacing the art on disk did nothing for anyone who had already opened the
 * app: their cache answered `/icons/icon-192.png` with the old bytes, and the
 * stale copy is the one the browser hands the launcher when the app is added to
 * a home screen. Worse, Android snapshots that bitmap at install time and never
 * re-reads it, so a bad icon sticks until the shortcut is deleted.
 *
 * The `?v=` is what breaks that chain: it's a different cache key, so the new
 * art is fetched rather than served from the old entry. Bump VERSION whenever
 * the icon art changes — regenerating the PNGs alone is not enough.
 */
const VERSION = '2';

const versioned = (path: string) => `${path}?v=${VERSION}`;

export const appIcons = {
  favicon16: versioned('/icons/favicon-16.png'),
  favicon32: versioned('/icons/favicon-32.png'),
  icon192: versioned('/icons/icon-192.png'),
  icon512: versioned('/icons/icon-512.png'),
  appleTouch: versioned('/icons/apple-touch-icon.png'),
} as const;
