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
 * In the page's flow, first thing in the body, rather than fixed over it: a
 * fixed bar reserved no room and sat on top of each page's header — on the
 * Practice screen, over Back, Select, Live and the rest — so the controls
 * that still worked offline couldn't be tapped. In flow it pushes the page
 * down instead, and scrolls away with it. Live mode, an overlay meant to be
 * chrome-free on stage, still covers it.
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
      className="flex items-center justify-center gap-3 bg-warn-fill px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200"
    >
      <span>You’re offline.</span>
      <a href="/offline" className="font-medium underline">
        Downloaded setlists
      </a>
    </div>
  );
}
