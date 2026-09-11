'use client';

import Link from 'next/link';
import { Modal } from '../Modal';
import { formatDateLong, formatTimeRange } from '@/lib/format';
import { eventColorKey } from './eventColors';
import { lastDayOf } from './eventBars';
import { eventLabel } from './eventLabel';
import type { WeekRowEvent } from './WeekRow';

export type DaySummaryEvent = WeekRowEvent & {
  endTime: string | null;
  bandName: string;
  location: string | null;
  venueName: string | null;
  venueAddress: string | null;
};

/** An event's display location: prefer its venue (name + address). */
function displayLocation(ev: DaySummaryEvent): string | null {
  if (ev.venueName)
    return [ev.venueName, ev.venueAddress].filter(Boolean).join(', ');
  return ev.location;
}

/**
 * One day's events, opened by tapping a day in a `WeekRow`.
 *
 * Shared by the Calendar and Home's Activity week, because the bars in a week
 * row only have room for a title — this is where an event's band, time and
 * place are actually read. Filters `events` itself, so a multi-day event
 * counts on every day it covers.
 */
export function DaySummaryModal({
  date,
  events,
  onClose,
}: {
  /** `YYYY-MM-DD`. */
  date: string;
  events: DaySummaryEvent[];
  onClose: () => void;
}) {
  const dayEvents = events.filter(
    (ev) => ev.date <= date && lastDayOf(ev) >= date,
  );
  return (
    <Modal onClose={onClose} labelledBy="day-summary-title" size="sm">
      <h2 id="day-summary-title" className="text-base font-semibold">
        {formatDateLong(date)}
      </h2>
      {dayEvents.length === 0 ? (
        <p className="mt-3 text-sm minor-text-theme-colors">
          No events on this day.
        </p>
      ) : (
        <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-auto">
          {dayEvents.map((ev) => {
            const loc = displayLocation(ev);
            return (
              <li key={ev.id}>
                <Link
                  href={`/calendar/events/${ev.id}`}
                  data-event-type={eventColorKey(ev.eventType)}
                  className="block rounded-md border border-line border-l-[3px] border-l-[var(--event-accent)] px-3 py-2 hover:bg-surface-soft dark:border-l-[var(--event-accent)]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {eventLabel(ev)}
                    </span>
                    {ev.time && (
                      <span className="shrink-0 text-xs minor-text-theme-colors">
                        {formatTimeRange(ev.time, ev.endTime)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs minor-text-theme-colors">
                    {ev.bandName}
                    {loc ? ` · ${loc}` : ''}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <Link
          href={`/calendar/events/new?date=${date}`}
          className="btn-outline"
        >
          Add event
        </Link>
        <button type="button" onClick={() => onClose()} className="btn-ghost">
          Close
        </button>
      </div>
    </Modal>
  );
}
