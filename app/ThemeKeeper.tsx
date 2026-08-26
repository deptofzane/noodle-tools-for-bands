'use client';

import { useEffect } from 'react';
import { applyTheme, isTheme, THEME_IS_DARK, type Theme } from './theme';

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

    const wanted = (): Theme | null => {
      try {
        const stored = localStorage.getItem('theme');
        return isTheme(stored) ? stored : null;
      } catch {
        return null;
      }
    };

    const apply = () => {
      // A screen has imposed a theme (see `applyTheme`'s override) — restoring
      // the stored one here would flip it straight back.
      if (root.dataset.themeOverride) return;
      const want = wanted();
      // Nothing stored (storage cleared mid-session) — leave it alone rather
      // than guess, so this never fights the user.
      if (!want) return;
      // Only touch the DOM on a real disagreement, so this can't loop: the
      // change below re-triggers the observer, which then finds nothing to do.
      if (
        root.dataset.theme !== want ||
        root.classList.contains('dark') !== THEME_IS_DARK[want]
      ) {
        applyTheme(want);
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-theme-override'],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
