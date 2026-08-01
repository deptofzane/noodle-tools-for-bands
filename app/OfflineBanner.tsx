'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A slim bar that appears when the browser loses its connection, with a way
 * through to what still works. Without it, a connection that drops while the
 * app is open leaves every link dead — in-app navigation fetches from the
 * server, and there's nothing to fall back to until a navigation actually
 * fails. The link is a plain `<a>` so it goes through the service worker.
 *
 * Sits above the app's own chrome but below Live mode, which is meant to be
 * chrome-free on stage.
 */
export function OfflineBanner() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // Nothing to add on the page that already says all this.
  if (!offline || pathname === '/offline') return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[55] flex items-center justify-center gap-3 bg-amber-100 px-3 py-1.5 text-xs text-amber-900 lg:top-[var(--app-nav-h)] dark:bg-amber-950 dark:text-amber-200"
    >
      <span>You’re offline.</span>
      <a href="/offline" className="font-medium underline">
        Downloaded setlists
      </a>
    </div>
  );
}
