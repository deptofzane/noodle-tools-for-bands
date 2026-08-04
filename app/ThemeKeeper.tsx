'use client';

import { useEffect } from 'react';

/**
 * Keeps the `dark` class on `<html>` from being lost.
 *
 * The pre-paint script in the layout sets that class imperatively, so React
 * doesn't know it exists — the server renders `<html lang="en">` with no
 * `className` at all. Any render that re-sends the root layout therefore
 * reconciles the attribute away: navigating to a `notFound()` route or an
 * error boundary sends the whole tree from the root, and the theme silently
 * flips to light.
 *
 * Rather than move the theme into React (which would mean a cookie, so the
 * server can render the class, and would make the pre-paint script redundant),
 * this watches the attribute and puts the class back whenever it disagrees
 * with what the user chose. `MutationObserver` callbacks run as microtasks, so
 * the correction lands in the same frame as the removal — nothing paints in
 * between.
 */
export function ThemeKeeper() {
  useEffect(() => {
    const root = document.documentElement;

    const wantsDark = (): boolean => {
      try {
        const stored = localStorage.getItem('theme');
        // Nothing stored (storage cleared mid-session) — leave it as-is rather
        // than guess, so this never fights the user.
        if (stored !== 'dark' && stored !== 'light') {
          return root.classList.contains('dark');
        }
        return stored === 'dark';
      } catch {
        return root.classList.contains('dark');
      }
    };

    const apply = () => {
      const want = wantsDark();
      // Only touch the DOM on a real disagreement, so this can't loop: the
      // toggle below re-triggers the observer, which then finds nothing to do.
      if (want !== root.classList.contains('dark')) {
        root.classList.toggle('dark', want);
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return null;
}
