'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** Pages that write data the page behind them is showing. */
const EDIT_ROUTE = /\/edit$/;

/**
 * Refetches a page's server data when you arrive back on it from an edit
 * screen.
 *
 * Edit screens used to do this themselves, calling `router.refresh()` just
 * before navigating away — which cannot work. `refresh()` refetches the route
 * you are *on*, i.e. the edit page that's about to be discarded, while
 * `router.back()` restores the destination from the client Router Cache
 * exactly as it was left. The page you land on is the one built before the
 * edit, so a renamed song or a newly defaulted audio version doesn't show.
 *
 * Running it from here instead means the refresh happens once the destination
 * *is* the current route, which is the only moment `refresh()` can reach it.
 * Mounted in the root layout so it outlives the navigation — anything inside
 * the edit page unmounts along with it.
 *
 * It fires on any exit from an edit screen, including Cancel. An extra RSC
 * fetch is cheap; deciding whether an edit "counted" would mean tracking every
 * write on those pages, including the ones (audio versions, sheet music) that
 * save immediately rather than on submit.
 */
export function RefreshAfterEdit() {
  const pathname = usePathname();
  const router = useRouter();
  const previous = useRef(pathname);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (!from || from === pathname) return;
    if (EDIT_ROUTE.test(from)) router.refresh();
  }, [pathname, router]);

  return null;
}
