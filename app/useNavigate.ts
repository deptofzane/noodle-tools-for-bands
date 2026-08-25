'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { startRouteProgress } from './RouteProgress';

/**
 * `router.push`, with the top-of-page progress bar.
 *
 * `RouteProgress` starts itself from a capture-phase click listener that looks
 * for an enclosing `<a>`, so links get the bar for nothing. A `<button>` has no
 * anchor to find — which is every item in an `ActionMenu` — so those
 * navigations have to say so themselves.
 *
 * One hook rather than a `startRouteProgress()` beside each `router.push`:
 * there are ~50 of them in menus alone, and the failure mode of forgetting one
 * is silent. Nothing here is specific to menus; any button that navigates
 * wants it.
 */
export function useNavigate(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      startRouteProgress();
      router.push(href);
    },
    [router],
  );
}
