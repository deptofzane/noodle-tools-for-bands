'use client';

import { useEffect, useState } from 'react';
import { applyTheme, isTheme, THEMES, THEME_LABELS, type Theme } from './theme';

/**
 * Theme picker.
 *
 * A segmented control rather than a toggle: with more than two themes there
 * is no "the other one" to flip to, and naming each destination beats a
 * button whose label depends on where you already are. Same shape as the
 * Songs/Albums and All/Mine selectors elsewhere.
 *
 * Reads the *applied* theme off `<html>` rather than storage — the pre-paint
 * script has already resolved the system fallback, so the DOM is the answer.
 * Renders a skeleton until that read happens on mount; server-rendering a
 * guess and correcting it on hydrate would be visually noisier.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const applied = document.documentElement.dataset.theme;
    setTheme(isTheme(applied) ? applied : 'light');
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Storage unavailable (private mode, quota) — the DOM change below
      // still applies for this page session.
    }
    applyTheme(next);
  };

  if (theme === null) {
    return (
      <div
        aria-hidden
        className="h-9 w-48 rounded-md border border-line bg-surface-soft"
      />
    );
  }

  return (
    <span
      role="group"
      aria-label="Theme"
      className="inline-flex items-center rounded-md border border-line-strong p-0.5 text-sm"
    >
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => choose(t)}
          aria-pressed={theme === t}
          className={
            'rounded px-3 py-1.5 ' +
            (theme === t
              ? 'bg-surface-hover font-medium text-fg'
              : 'text-fg-muted hover:text-fg-strong')
          }
        >
          {THEME_LABELS[t]}
        </button>
      ))}
    </span>
  );
}
