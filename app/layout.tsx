import { Suspense } from 'react';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { appIcons } from '@/lib/app-icons';
import { googlePickerAppId, hasAllDriveScopes } from '@/lib/google';
import { Header } from './Header';
import { CurrentBandProvider } from './CurrentBandProvider';
import { DriveCapabilityProvider } from './DriveCapabilityProvider';
import { NavigationHistoryProvider } from './NavigationHistoryProvider';
import { RefreshAfterEdit } from './RefreshAfterEdit';
import { OfflineBanner } from './OfflineBanner';
import { PendingActionProvider } from './PendingActionProvider';
import { PlaylistPlayerProvider } from './player/PlaylistPlayer';
import { RouteProgress } from './RouteProgress';
import { ThemeKeeper } from './ThemeKeeper';
import { StageOnLive } from './StageOnLive';
import { ToastProvider } from './ToastProvider';
import './globals.css';
import { THEME_COLORS, THEME_IS_DARK, THEMES } from './theme';

export const metadata: Metadata = {
  title: 'Noodle',
  description: 'Timestamped, collaborative notes on Google Drive audio.',
  applicationName: 'Noodle',
  // Launches the installed PWA full-screen on iOS and names the home-screen
  // icon. The manifest handles Android/desktop install.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Noodle',
  },
  icons: {
    icon: [
      // Smallest first: the 16 and 32 are drawn for those sizes rather than
      // scaled down from the install icon, which turns to mush in a tab.
      { url: appIcons.favicon16, sizes: '16x16', type: 'image/png' },
      { url: appIcons.favicon32, sizes: '32x32', type: 'image/png' },
      { url: appIcons.icon192, sizes: '192x192', type: 'image/png' },
      { url: appIcons.icon512, sizes: '512x512', type: 'image/png' },
    ],
    apple: appIcons.appleTouch,
  },
};

/*
 * No `themeColor` here on purpose. It would render one fixed value into the
 * HTML, and the bar has to follow the theme the user picked — so the pre-paint
 * script below owns that tag instead. One tag, one writer; see `app/theme.ts`.
 */

/**
 * Pre-paint theme script.
 *
 * Runs synchronously in <head> before any body content renders, so we
 * never flash the wrong theme. Reads the user's saved choice from
 * localStorage('theme'); when nothing is saved, falls back to the OS
 * `prefers-color-scheme` once and *pins* that result to localStorage, so
 * later loads (cold PWA launches, service-worker updates, hard navigations)
 * don't keep re-following the OS and flip the theme. Adds/removes the `dark`
 * class on `<html>`, which our `class`-mode Tailwind config keys off of.
 */
const themeInitScript = `
(function(){try{
  var colors = ${JSON.stringify(THEME_COLORS)};
  var isDark = ${JSON.stringify(THEME_IS_DARK)};
  var known = ${JSON.stringify(THEMES)};
  var stored = localStorage.getItem('theme');
  // Anything unrecognised (an older value, a hand-edited key) falls back to
  // the OS once, then pins — the same rule the two-theme version used.
  var theme = known.indexOf(stored) !== -1
    ? stored
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (isDark[theme]) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.setAttribute('content', colors[theme]);
  if (stored !== theme) { try { localStorage.setItem('theme', theme); } catch(e){} }
}catch(e){}})();
`;

/**
 * Pre-paint font-size script. Sets the html root font-size from the user's
 * saved choice so `rem`-based UI scales globally, with no size flash on load.
 * Sheet music is unaffected — it sizes off a fixed px base (`--sheet-base`).
 */
const fontInitScript = `
(function(){try{
  var px = parseInt(localStorage.getItem('fontSize'), 10);
  if (px >= 12 && px <= 24) { document.documentElement.style.fontSize = px + 'px'; }
}catch(e){}})();
`;

/**
 * Pre-paint nav-order script. Mirrors the mobile nav bar and moves the ☰
 * drawer to the left edge for the left-handed setting (Settings ›
 * Appearance).
 *
 * Pre-paint for the same reason the two above are: without it the bar paints
 * right-handed and visibly flips once React hydrates, on every page load. The
 * attribute is all that ships — the mirroring itself is CSS, so no component
 * has to know the preference.
 */
const navInitScript = `
(function(){try{
  if (localStorage.getItem('navReversed') === '1') {
    document.documentElement.setAttribute('data-nav-reversed', '');
  }
}catch(e){}})();
`;

/**
 * Root layout. Reads the session server-side and renders the global
 * `<Header />` for any signed-in route. The login page falls through
 * with no nav. Public API routes are unaffected (they don't pass
 * through this layout).
 *
 * `suppressHydrationWarning` on <html> is needed because the inline
 * theme script mutates `class` before React hydrates.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isSignedIn = Boolean(session?.user);
  const canUseDrive =
    hasAllDriveScopes(session?.scopes) &&
    Boolean(session?.accessToken) &&
    session?.error !== 'RefreshAccessTokenError';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: fontInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: navInitScript }} />
      </head>
      <body
        className={
          'min-h-screen antialiased bg-page text-fg' +
          // Reserves room for the fixed nav bar on the side it's pinned to.
          (isSignedIn ? ' has-app-nav' : '')
        }
      >
        {/* Restores the theme class when a re-render of this layout drops it
            (see ThemeKeeper). */}
        <ThemeKeeper />
        {/* Dims the app on Live/Practice when that's been turned on. */}
        <StageOnLive />
        {/* Suspense: `RouteProgress` reads the query string, which opts its
            subtree out of prerendering. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <PendingActionProvider>
          <ToastProvider>
            <NavigationHistoryProvider>
              {/* Outside the pages themselves so it survives leaving one. */}
              <RefreshAfterEdit />
              <DriveCapabilityProvider
                canUseDrive={canUseDrive}
                pickerAppId={googlePickerAppId()}
              >
                <CurrentBandProvider enabled={isSignedIn}>
                  <PlaylistPlayerProvider userKey={session?.user?.sub ?? null}>
                    {children}
                    {isSignedIn && (
                      <Header userEmail={session?.user?.email ?? null} />
                    )}
                    <OfflineBanner />
                  </PlaylistPlayerProvider>
                </CurrentBandProvider>
              </DriveCapabilityProvider>
            </NavigationHistoryProvider>
          </ToastProvider>
        </PendingActionProvider>
      </body>
    </html>
  );
}
