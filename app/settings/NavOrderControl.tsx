'use client';

import { useEffect, useState } from 'react';

/** Set on <html> by the pre-paint script in app/layout.tsx. */
const ATTRIBUTE = 'data-nav-reversed';
const STORAGE_KEY = 'navReversed';

/**
 * Mirror the mobile nav bar for left-handed use (Settings › Appearance).
 *
 * The preference is only ever an attribute on `<html>`; the mirroring itself
 * is CSS (`[data-nav-reversed]` in globals.css), so the nav doesn't re-render
 * and there is no state to keep in step with it. Applied pre-paint on load,
 * which is why the bar doesn't flip after hydration.
 *
 * Per-device like the theme and font size beside it — the same localStorage
 * rather than the account, so a shared login doesn't hand one person's
 * handedness to everyone.
 */
export function NavOrderControl() {
  // Null until mounted, since it reads localStorage: the server render and
  // the first client render have to agree.
  const [reversed, setReversed] = useState<boolean | null>(null);

  useEffect(() => {
    setReversed(document.documentElement.hasAttribute(ATTRIBUTE));
  }, []);

  const toggle = () => {
    const next = !reversed;
    setReversed(next);
    const root = document.documentElement;
    if (next) root.setAttribute(ATTRIBUTE, '');
    else root.removeAttribute(ATTRIBUTE);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // storage unavailable (private mode) — the live change above still holds
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={reversed ?? false}
      className={
        'shrink-0 rounded-md border px-4 py-2 text-sm font-medium transition ' +
        (reversed
          ? 'border-accent-line bg-accent-fill text-accent'
          : 'border-line-strong hover:bg-surface-soft')
      }
    >
      {reversed ? 'On' : 'Off'}
    </button>
  );
}
