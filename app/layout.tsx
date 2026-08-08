import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { auth } from '@/auth';
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
import { ToastProvider } from './ToastProvider';
import './globals.css';

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
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

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
  var stored = localStorage.getItem('theme');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = stored === 'dark' || (!stored && systemDark);
  var root = document.documentElement;
  if (isDark) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
  // Pin the resolved theme on first run (class already applied above, so a
  // storage failure can't leave the page unstyled).
  if (!stored) { try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch(e){} }
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
      </head>
      <body
        className={
          'min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-900 dark:text-neutral-100' +
          // Reserves room for the fixed nav bar on the side it's pinned to.
          (isSignedIn ? ' has-app-nav' : '')
        }
      >
        {/* Restores the theme class when a re-render of this layout drops it
            (see ThemeKeeper). */}
        <ThemeKeeper />
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
                    {isSignedIn && <Header />}
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
