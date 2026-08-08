'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateRange, formatDateShort, formatTimeRange } from '@/lib/format';
import { completionInstant } from './eventTiming';
import { liveHref, practiceHref } from '@/lib/routes';
import { usePersistedBoolean } from '../usePersistedBoolean';
import { eventColorKey } from '../calendar/eventColors';
import { eventLabel } from '../calendar/eventLabel';

export interface UpcomingShow {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  /** Drives the colour coding — see app/calendar/eventColors.ts. */
  eventType: string | null;
  /** Display name of whoever created it — see `eventLabel`. */
  createdByName: string | null;
  /** Playable songs in the setlist; 0 when there's no setlist or only markers. */
  setlistSongCount: number;
  date: string; // YYYY-MM-DD
  /** Last day, inclusive; null when it ends the day it starts. */
  endDate: string | null;
  time: string | null;
  endTime: string | null;
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
 *
 * When nothing falls in the next 7 days, we fall back to `nextEvent` — the
 * single soonest upcoming event, however far out — so the section always
 * surfaces the next thing on the calendar. Renders nothing only when there
 * are no upcoming events at all.
 */
export function UpcomingShows({
  shows,
  nextEvent,
  serverToday,
}: {
  shows: UpcomingShow[];
  nextEvent?: UpcomingShow | null;
  serverToday: string;
}) {
  // Expanded by default, but the choice sticks across visits.
  const [open, setOpen] = usePersistedBoolean('homeUpcomingShowsOpen', true);
  const [today, setToday] = useState(serverToday);
  // Set on mount so already-finished events drop out (they move to Recent).
  // Null on the server + first client render → no time filtering yet, so no
  // hydration mismatch.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const local = localToday();
    if (local !== today) setToday(local);
    setNow(Date.now());
    // Only correcting to the browser's clock once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notFinished = (s: UpcomingShow) =>
    now === null || completionInstant(s).getTime() > now;

  const weekOut = addDays(today, 7);
  const visible = shows.filter(
    (s) => s.date >= today && s.date <= weekOut && notFinished(s),
  );

  // Fall back to the next event (however far out) when the week is empty.
  const usingFallback = visible.length === 0;
  const items = !usingFallback
    ? visible
    : nextEvent && nextEvent.date >= today && notFinished(nextEvent)
      ? [nextEvent]
      : [];
  if (items.length === 0) return null;

  const renderShow = (s: UpcomingShow) => (
    <li
      key={s.id}
      data-event-type={eventColorKey(s.eventType)}
      className="flex items-center gap-1 border-l-[3px] border-l-[color:var(--event-accent)] bg-[color:var(--event-fill)] px-3 py-2.5"
    >
      <Link
        href={`/calendar/events/${s.id}`}
        className="-mx-1 flex min-w-0 flex-1 items-start flex-col justify-start gap-3 rounded px-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-[color:var(--event-accent)]">
            {eventLabel(s)}
          </span>
          <span className="truncate text-[0.6875rem] minor-text-theme-colors">
            <span className="minor-text-band-theme-colors">{s.bandName}</span>
            {s.location ? ` · ${s.location}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-[0.6875rem] minor-text-theme-colors">
          <span className="block font-medium text-neutral-700 dark:text-neutral-300">
            {formatDateRange(s.date, s.endDate, formatDateShort)}
          </span>
          {s.time && <span>{formatTimeRange(s.time, s.endTime)}</span>}
        </span>
      </Link>
      {/* Practice and Live have nothing to show for an empty setlist, so the
          row says why and offers the one action that helps: opening the
          setlist to put songs in it. */}
      {s.setlistId && s.setlistSongCount > 0 && (
        <div className="ml-2 flex shrink-0 flex-col gap-2">
          <Link
            href={practiceHref(s.setlistId)}
            title="Practice this event’s setlist"
            className="rounded-md border border-neutral-300 px-2.5 py-2 text-center text-xs font-medium hover:bg-black/[0.04] dark:border-neutral-700 dark:hover:bg-white/[0.06]"
          >
            Practice
          </Link>
          <Link
            href={liveHref(s.setlistId)}
            title="Perform this event’s setlist live"
            className="rounded-md border border-neutral-300 px-2.5 py-2 text-center text-xs font-medium hover:bg-black/[0.04] dark:border-neutral-700 dark:hover:bg-white/[0.06]"
          >
            Live
          </Link>
        </div>
      )}
      {s.setlistId && s.setlistSongCount === 0 && (
        <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
          <span className="text-[0.6875rem] minor-text-theme-colors">
            This setlist has no songs
          </span>
          <Link
            href={`/bands/${s.bandId}/setlists/${s.setlistId}`}
            className="rounded-md border border-neutral-300 px-2.5 py-2 text-center text-xs font-medium hover:bg-black/[0.04] dark:border-neutral-700 dark:hover:bg-white/[0.06]"
          >
            View setlist
          </Link>
        </div>
      )}
    </li>
  );

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
        <span className="text-xs minor-text-theme-colors">
          <span aria-hidden="true">·</span>{' '}
          {usingFallback ? 'next event' : `next 7 days · ${visible.length}`}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map(renderShow)}
        </ul>
      )}
    </section>
  );
}
