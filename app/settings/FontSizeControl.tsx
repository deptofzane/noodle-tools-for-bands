'use client';

import { useEffect, useState } from 'react';

const OPTIONS: { px: number; label: string }[] = [
  { px: 14, label: 'Small' },
  { px: 16, label: 'Default' },
  { px: 18, label: 'Large' },
  { px: 20, label: 'Extra large' },
];
const DEFAULT_PX = 16;

/** The saved root font size in px, or the default when unset/invalid. */
function readSaved(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_PX;
  const px = parseInt(localStorage.getItem('fontSize') ?? '', 10);
  return OPTIONS.some((o) => o.px === px) ? px : DEFAULT_PX;
}

/**
 * Global font-size picker. Scales the html root font-size (so all `rem`-based
 * UI grows/shrinks together), persisted to localStorage and applied pre-paint
 * by the head script in app/layout.tsx. Sheet music is deliberately excluded —
 * it sizes off a fixed px base (`--sheet-base`), so charts stay put.
 */
export function FontSizeControl() {
  // Null until mounted (it reads localStorage), so the server render and first
  // client render agree; the highlight appears after hydration.
  const [px, setPx] = useState<number | null>(null);

  useEffect(() => {
    setPx(readSaved());
  }, []);

  const select = (next: number) => {
    setPx(next);
    try {
      localStorage.setItem('fontSize', String(next));
    } catch {
      // storage unavailable (private mode) — the live change below still holds
    }
    document.documentElement.style.fontSize = `${next}px`;
  };

  return (
    <div
      role="group"
      aria-label="Font size"
      className="flex flex-wrap items-center gap-1.5"
    >
      {OPTIONS.map((o) => {
        const active = px === o.px;
        return (
          <button
            key={o.px}
            type="button"
            onClick={() => select(o.px)}
            aria-pressed={active}
            className={
              'rounded-md border px-3 py-1.5 text-sm font-medium transition ' +
              (active
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
