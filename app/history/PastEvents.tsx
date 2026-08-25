'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { formatDateRange, formatTimeRange } from '@/lib/format';
import { LoadingBlock } from '../Spinner';
import { PAGE_SIZE } from '@/lib/paging';
import { LoadMore } from '../LoadMore';
import { usePagedList } from '../usePagedList';
import { eventLabel } from '../calendar/eventLabel';

interface PastEvent {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  /** Drives the colour coding and the time-off label. */
  eventType: string | null;
  createdByName: string | null;
  date: string;
  /** Last day, inclusive; null when it ends the day it starts. */
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  location: string | null;
  venueName: string | null;
}

/** Today as YYYY-MM-DD on this device — what counts as "already happened". */
function localToday(): string {
  const n = new Date();
  const p = (x: number) => x.toString().padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/**
 * Events that have already happened, across the viewer's bands, most recent
 * first. The cutoff is computed on the client and sent with the request:
 * whether an event is past depends on the viewer's clock, not the server's,
 * and computing it during render would risk a hydration mismatch.
 */
export function PastEvents() {
  const fetchPage = useCallback(
    (offset: number) =>
      fetch(
        `/api/history?category=events&today=${localToday()}` +
          `&limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: 'no-store' },
      ),
    [],
  );
  const pick = useCallback(
    (d: unknown) => (d as { events: PastEvent[] }).events,
    [],
  );
  const { items, hasMore, loadingMore, error, loadMore } =
    usePagedList<PastEvent>(fetchPage, pick);

  if (error)
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  if (items === null) return <LoadingBlock label="Loading past events" />;
  if (items.length === 0)
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
        No past events yet. Events move here the day after they happen.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <LoadMore
        shown={items.length}
        noun="past event"
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={() => void loadMore()}
      />
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {items.map((event) => {
          const where = event.venueName ?? event.location;
          return (
            <li key={event.id}>
              <Link
                href={`/calendar/events/${event.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-neutral-50 md:px-3 md:py-1.5 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {eventLabel(event)}
                  </div>
                  <div className="mt-0.5 text-xs minor-text-theme-colors">
                    {event.bandName} ·{' '}
                    {formatDateRange(event.date, event.endDate)}
                    {event.time && (
                      <> · {formatTimeRange(event.time, event.endTime)}</>
                    )}
                    {where && <> · {where}</>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
