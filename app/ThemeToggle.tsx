'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Reads the *currently applied* theme by inspecting the `.dark` class
 * the inline head script set on `<html>` before paint. This avoids a
 * separate read from localStorage on first paint (the script already
 * resolved system-pref fallback for us).
 */
function readAppliedTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Theme toggle button.
 *
 * Renders nothing meaningful on the server (initial state is `null`),
 * then hydrates to the actual theme via effect. This is intentional —
 * server-rendering a wrong label and flipping it on hydrate would be
 * visually noisier than a brief skeleton.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readAppliedTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Storage might be unavailable (private mode, quota); the class
      // change below still applies for the current page session.
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  // Skeleton — same dimensions as the real button to avoid layout shift.
  if (theme === null) {
    return (
      <div
        aria-hidden
        className="h-9 w-32 rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      />
    );
  }

  const label = theme === 'dark' ? 'Switch to light' : 'Switch to dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === 'dark'}
      className="min-w-max inline-flex h-9 items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-900"
    >
      <span aria-hidden className="text-base leading-none">
        {theme === 'dark' ? '☀' : '☾'}
      </span>
      {label}
    </button>
  );
}
