'use client';

import { useEffect, useState } from 'react';
import { applyTheme, isTheme, THEMES, THEME_LABELS, type Theme } from './theme';
import { STAGE_ON_LIVE_KEY, stageOnLiveEnabled } from './StageOnLive';

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
  const [stageOnLive, setStageOnLive] = useState(false);

  useEffect(() => {
    const applied = document.documentElement.dataset.theme;
    setTheme(isTheme(applied) ? applied : 'light');
    setStageOnLive(stageOnLiveEnabled());
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

  const toggleStageOnLive = (on: boolean) => {
    setStageOnLive(on);
    try {
      localStorage.setItem(STAGE_ON_LIVE_KEY, on ? 'on' : 'off');
    } catch {
      // Storage unavailable — the setting just won't persist.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <span
        role="group"
        aria-label="Theme"
        className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-line-strong p-0.5 text-sm justify-between"
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

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={stageOnLive}
          onChange={(e) => toggleStageOnLive(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">Use Stage while playing</span>
          <span className="block text-xs minor-text-theme-colors">
            Switches to the Stage theme on the Live and Practice screens, and
            back when you leave. Dim and warm, so the screen doesn&rsquo;t light
            up the room or your night vision.
          </span>
        </span>
      </label>
    </div>
  );
}
