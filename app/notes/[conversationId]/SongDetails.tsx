'use client';

import type { ReactNode } from 'react';
import { usePersistedBoolean } from '../../usePersistedBoolean';

/**
 * Collapsible "Song details" section on the song page (tempo/key, sheet
 * music). Collapsed by default; its open/closed state persists to
 * localStorage so it stays how the user left it.
 *
 * `actions` sits opposite the toggle on the header row, which is outside the
 * collapsible body on purpose — the song's actions shouldn't be hidden behind
 * a section that starts shut.
 */
export function SongDetails({
  actions,
  children,
}: {
  /** Right-hand side of the header row; the song's kebab. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [minimized, setMinimized] = usePersistedBoolean(
    'songDetailsMinimized',
    true,
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMinimized((v) => !v)}
          aria-expanded={!minimized}
          aria-label={
            minimized ? 'Expand Song details' : 'Minimize Song details'
          }
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            {minimized ? '▸' : '▾'}
          </span>
          <h2 className="text-sm font-medium">Song details</h2>
        </button>
        {actions}
      </div>
      {!minimized && children}
    </section>
  );
}
