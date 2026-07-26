'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

/**
 * Tracks in-app navigation so a "Back" control can know whether going back
 * stays inside the app.
 *
 * We keep a small stack of visited pathnames. A navigation to the entry
 * *below* the current top is treated as a back step (pop); anything else is
 * a forward step (push). `canGoBack()` is true only when there's a recorded
 * previous page — so on a fresh load / deep link (stack of one), or after
 * stepping back to where we entered, callers fall back to an explicit href
 * instead of `router.back()` (which could leave the app).
 *
 * Query strings are ignored (usePathname is path-only). Not persisted across
 * refresh — a reload conservatively resets to "no in-app history".
 */
const CanGoBackContext = createContext<() => boolean>(() => false);

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stackRef = useRef<string[]>([]);

  // Lazy-init with the landing path.
  if (stackRef.current.length === 0 && pathname) {
    stackRef.current = [pathname];
  }

  useEffect(() => {
    const stack = stackRef.current;
    const top = stack[stack.length - 1];
    if (!pathname || pathname === top) return; // initial mount / no change
    if (pathname === stack[stack.length - 2]) {
      stack.pop(); // stepped back
    } else { // stop edit pages from being included in stack
      stack.push(pathname); // moved forward
    }
  }, [pathname]);

  const canGoBack = useMemo(() => () => stackRef.current.length > 1, []);

  return (
    <CanGoBackContext.Provider value={canGoBack}>
      {children}
    </CanGoBackContext.Provider>
  );
}

/** Returns a getter that reports whether an in-app back step is available. */
export function useCanGoBack(): () => boolean {
  return useContext(CanGoBackContext);
}
