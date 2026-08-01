'use client';

import { useEffect, useState } from 'react';

/** Tailwind's `lg` breakpoint — what the rest of the app calls "desktop". */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * True on desktop-width viewports, kept in sync as the window resizes.
 * Starts `false` and resolves after mount so the server-rendered markup stays
 * deterministic — use it for behavior that CSS breakpoints can't express (a
 * default value, say), not for styling that a `lg:` class could handle.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return isDesktop;
}
