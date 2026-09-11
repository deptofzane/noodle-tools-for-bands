'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EventListItem } from '@/lib/db/events';
import { addDays } from '@/lib/event-dates';
import {
  formatDateRange,
  formatDateShort,
  formatTimeRange,
} from '@/lib/format';
import { WeekRow } from '../calendar/WeekRow';
import { DaySummaryModal } from '../calendar/DaySummaryModal';
import { lastDayOf } from '../calendar/eventBars';
import { eventColorKey } from '../calendar/eventColors';
import { eventLabel } from '../calendar/eventLabel';

/** `YYYY-MM-DD` as e.g. "Sat, Sep 13" — read as UTC so no timezone shifts the day. */
function formatWeekday(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    ...opts,
  });
}

/** Everything covering `day` — a multi-day event counts on each of them. */
const covering = (events: EventListItem[], day: string) =>
  events.filter((ev) => ev.date <= day && lastDayOf(ev) >= day);

/**
 * The next seven days of events: today plus six, rolling.
 *
 * Rolling rather than Sunday–Saturday so "upcoming" never means mostly the
 * past — on a Saturday a calendar week would be six days gone.
 *
 * The server can't know the viewer's timezone, so it sends a buffered range
 * and its own date; `today` starts at that value (so the server render and the
 * first client render agree) and is corrected to the browser's date on mount.
 *
 * A seven-column grid from `lg` up, where each day has room; below that a list
 * of the seven days, since at ~58px a column truncates every title to a few
 * letters. Both are rendered and CSS picks one — neither has side effects, so
 * nothing needs measuring.
 */
export function ActivityWeek({
  events,
  nextEvent,
  serverToday,
}: {
  events: EventListItem[];
  /** The soonest event however far out, for when the week is empty. */
  nextEvent: EventListItem | null;
  serverToday: string;
}) {
  const [today, setToday] = useState(serverToday);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);

  useEffect(() => {
    const local = new Date().toLocaleDateString('en-CA');
    if (local !== today) setToday(local);
    // Correcting to the browser's clock once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const last = days[6]!;
  // Overlap, not containment: a festival that started yesterday is still on
  // this week. Comparing its start date alone would drop it.
  const inWeek = events.filter(
    (ev) => ev.date <= last && lastDayOf(ev) >= today,
  );

  return (
    <section className="flex flex-col gap-2" aria-labelledby="activity-week">
      <h2 id="activity-week" className="text-base font-medium">
        Upcoming events
      </h2>

      {inWeek.length === 0 ? (
        <NothingThisWeek nextEvent={nextEvent} today={today} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line lg:block">
            <div className="grid grid-cols-7 gap-px bg-fill-strong">
              {days.map((day) => (
                <div
                  key={day}
                  className="bg-surface-soft py-1.5 text-center text-xs font-medium minor-text-theme-colors"
                >
                  {formatWeekday(day, { weekday: 'short' })}
                </div>
              ))}
            </div>
            <WeekRow
              days={days}
              events={inWeek}
              today={today}
              onSelectDay={setSummaryDate}
            />
          </div>

          <ol className="flex flex-col gap-3 lg:hidden">
            {days.map((day, i) => (
              <WeekDay
                key={day}
                day={day}
                label={
                  i === 0
                    ? 'Today'
                    : i === 1
                      ? 'Tomorrow'
                      : formatWeekday(day, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                }
                events={covering(inWeek, day)}
              />
            ))}
          </ol>
        </>
      )}

      {summaryDate && (
        <DaySummaryModal
          date={summaryDate}
          events={inWeek}
          onClose={() => setSummaryDate(null)}
        />
      )}
    </section>
  );
}

/**
 * Band, then when: a run's dates (on a middle day they're why it's listed at
 * all), and its time on the day it starts.
 */
function weekDayMeta(ev: EventListItem, day: string): string {
  const parts = [ev.bandName];
  if (ev.endDate)
    parts.push(formatDateRange(ev.date, ev.endDate, formatDateShort));
  if (ev.time && day === ev.date)
    parts.push(formatTimeRange(ev.time, ev.endTime));
  return parts.join(' · ');
}

/** One day of the phone's list. A multi-day event appears on each day it covers. */
function WeekDay({
  day,
  label,
  events,
}: {
  day: string;
  label: string;
  events: EventListItem[];
}) {
  return (
    <li className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide minor-text-theme-colors">
        {label}
      </h3>
      {events.length === 0 ? (
        <p className="text-sm minor-text-theme-colors">No events</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {events.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/calendar/events/${ev.id}`}
                data-event-type={eventColorKey(ev.eventType)}
                className="block rounded-md border-l-[3px] border-l-[color:var(--event-accent)] bg-[color:var(--event-fill)] px-3 py-2"
              >
                <span className="block truncate text-sm font-medium text-[color:var(--event-accent)]">
                  {eventLabel(ev)}
                </span>
                <span className="block truncate text-xs minor-text-theme-colors">
                  {weekDayMeta(ev, day)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * An empty week, without looking like a broken screen: say so, and point at
 * the next thing on the calendar however far out it is.
 */
function NothingThisWeek({
  nextEvent,
  today,
}: {
  nextEvent: EventListItem | null;
  today: string;
}) {
  const next = nextEvent && lastDayOf(nextEvent) >= today ? nextEvent : null;
  return (
    <p className="rounded-lg border border-line px-4 py-3 text-sm minor-text-theme-colors">
      Nothing this week.
      {next && (
        <>
          {' '}
          Next up:{' '}
          <Link
            href={`/calendar/events/${next.id}`}
            className="font-medium text-accent hover:underline"
          >
            {eventLabel(next)}
          </Link>
          , {formatDateShort(next.date)}
        </>
      )}
    </p>
  );
}
