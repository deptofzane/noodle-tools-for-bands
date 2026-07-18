'use client';

import { useEffect, useState } from 'react';
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
  setlistId: string | null;
}

/** Today's date, YYYY-MM-DD, in the browser's local timezone. */
function localToday(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Add `n` days to a YYYY-MM-DD date, staying in local time. */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + n);
  return dt.toLocaleDateString('en-CA');
}

/**
 * Collapsible list of shows in the next 7 days, across the user's bands.
 *
 * The server passes a buffered set of rows plus its own date; we re-window
 * to the next 7 days in the *viewer's* timezone. `today` is seeded from the
 * server value so the server render and first client render match (no
 * hydration mismatch), then corrected to the browser's local date on mount.
 * Renders nothing once the local window is empty.
 */
export function UpcomingShows({
  shows,
  serverToday,
}: {
  shows: UpcomingShow[];
  serverToday: string;
}) {
  const [open, setOpen] = useState(true);
  const [today, setToday] = useState(serverToday);

  useEffect(() => {
    const local = localToday();
    if (local !== today) setToday(local);
    // Only correcting to the browser's clock once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekOut = addDays(today, 7);
  const visible = shows.filter((s) => s.date >= today && s.date <= weekOut);
  if (visible.length === 0) return null;

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
        <h2 className="text-sm font-medium">Upcoming events</h2>
        <span className="text-xs text-neutral-500">
          <span aria-hidden="true">·</span> next 7 days · {visible.length}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {visible.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2.5">
              <Link
                href={`/calendar/events/${s.id}`}
                className="-mx-1 flex min-w-0 flex-1 items-start justify-start gap-3 rounded px-1 hover:bg-neutral-50 dark:hover:bg-neutral-900"
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
              {s.setlistId && (
                <Link
                  href={`/bands/${s.bandId}/setlists/${s.setlistId}/practice`}
                  title="Practice this event’s setlist"
                  className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  Practice
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
