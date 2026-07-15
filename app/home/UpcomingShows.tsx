'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDateShort, formatTime12h } from '@/lib/format';

export interface UpcomingShow {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  location: string | null;
}

/**
 * Collapsible list of shows happening in the next week, across the user's
 * bands. Rendered on Home only when there's at least one (the server omits
 * it otherwise). Starts expanded.
 */
export function UpcomingShows({ shows }: { shows: UpcomingShow[] }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 self-start text-left"
      >
        <span
          aria-hidden="true"
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {open ? '▾' : '▸'}
        </span>
        <h2 className="text-sm font-medium">Upcoming shows</h2>
        <span className="text-xs text-neutral-500">
          <span aria-hidden="true">·</span> next 7 days · {shows.length}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {shows.map((s) => (
            <li key={s.id}>
              <Link
                href={`/bands/${s.bandId}`}
                className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{s.title}</span>
                  <span className="truncate text-[11px] text-neutral-500">
                    {s.bandName}
                    {s.location ? ` · ${s.location}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-neutral-500">
                  <span className="block font-medium text-neutral-700 dark:text-neutral-300">
                    {formatDateShort(s.date)}
                  </span>
                  {s.time && <span>{formatTime12h(s.time)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
