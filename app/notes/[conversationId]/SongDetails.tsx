'use client';

import type { ReactNode } from 'react';
import { usePersistedBoolean } from '../../usePersistedBoolean';

/**
 * Collapsible "Song Details" section on the song page (tempo/key, Practice /
 * Live links). Collapsed by default; its open/closed state persists to
 * localStorage so it stays how the user left it.
 */
export function SongDetails({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = usePersistedBoolean(
    'songDetailsMinimized',
    true,
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMinimized((v) => !v)}
          aria-expanded={!minimized}
          aria-label={
            minimized ? 'Expand Song Details' : 'Minimize Song Details'
          }
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            {minimized ? '▸' : '▾'}
          </span>
          <h2 className="text-sm font-medium">Song Details</h2>
        </button>
      </div>
      {!minimized && children}
    </section>
  );
}
