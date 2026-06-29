import type { Metadata } from 'next';
import { auth } from '@/auth';
import { Header } from './Header';
import { PendingActionProvider } from './PendingActionProvider';
import { ToastProvider } from './ToastProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sidestage',
  description: 'Timestamped, collaborative notes on Google Drive audio.',
};

/**
 * Pre-paint theme script.
 *
 * Runs synchronously in <head> before any body content renders, so we
 * never flash the wrong theme. Reads the user's saved choice from
 * localStorage('theme'); when nothing is saved, falls back to the OS
 * `prefers-color-scheme`. Adds/removes the `dark` class on
 * `<html>`, which our `class`-mode Tailwind config keys off of.
 */
const themeInitScript = `
(function(){try{
  var stored = localStorage.getItem('theme');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = stored === 'dark' || (!stored && systemDark);
  var root = document.documentElement;
  if (isDark) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
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

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <PendingActionProvider>
          <ToastProvider>
            {isSignedIn && <Header />}
            {children}
          </ToastProvider>
        </PendingActionProvider>
      </body>
    </html>
  );
}
