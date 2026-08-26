'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '../Modal';
import { useTrackPending } from '../PendingActionProvider';
import { formatDateLong, formatTime12h, formatTimeRange } from '@/lib/format';
import { eventColorKey } from './eventColors';
import { layoutWeekBars, lastDayOf } from './eventBars';
import { eventLabel } from './eventLabel';
import { useCurrentBand } from '../CurrentBandProvider';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD start
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  eventType: string | null;
  /** Display name of whoever created it — see `eventLabel`. */
  createdByName: string | null;
  bandName: string;
  location: string | null;
  venueName: string | null;
  venueAddress: string | null;
}

const pad = (n: number) => n.toString().padStart(2, '0');

// Bar geometry, in px because the overlay is positioned against the cell box
// rather than flowing inside it. `BAR_TOP_PX` clears the day number (p-1 plus
// a 24px circle); the pitch is one bar plus the gap under it.
const BAR_TOP_PX = 30;
const BAR_PITCH_PX = 18;
const BAR_BOTTOM_PX = 6;
/** Keeps a quiet week the same height it has always been. */
const MIN_CELL_PX = 96;

/** An event's display location: prefer its venue (name + address). */
function displayLocation(ev: CalendarEvent): string | null {
  if (ev.venueName)
    return [ev.venueName, ev.venueAddress].filter(Boolean).join(', ');
  return ev.location;
}

/**
 * Month calendar. Navigable by month, today highlighted. Fetches the
 * visible month's events and renders them into the day cells; clicking a
 * day opens a summary of that day's shows across all the user's bands.
 */
export function CalendarClient() {
  const trackPending = useTrackPending();
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // The day whose shows-summary is open (YYYY-MM-DD), or null.
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const { bandId: currentBandId } = useCurrentBand();

  const startWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dateStr = (d: number) =>
    `${view.year}-${pad(view.month + 1)}-${pad(d)}`;

  /** Everything covering this day — a multi-day event counts on all of them. */
  const eventsOn = (day: string) =>
    events.filter((ev) => ev.date <= day && lastDayOf(ev) >= day);
  const isToday = (d: number) =>
    today.getFullYear() === view.year &&
    today.getMonth() === view.month &&
    today.getDate() === d;

  const load = useCallback(async () => {
    const from = `${view.year}-${pad(view.month + 1)}-01`;
    const to = `${view.year}-${pad(view.month + 1)}-${pad(daysInMonth)}`;
    try {
      const r = await fetch(`/api/events?from=${from}&to=${to}`, {
        cache: 'no-store',
      });
      if (!r.ok) return;
      const d = (await r.json()) as { events: CalendarEvent[] };
      setEvents(d.events);
    } catch {
      // Non-fatal: the grid still renders without events.
    }
  }, [view.year, view.month, daysInMonth]);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  const prevMonth = () =>
    setView((v) =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { ...v, month: v.month - 1 },
    );
  const nextMonth = () =>
    setView((v) =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { ...v, month: v.month + 1 },
    );
  const goToday = () =>
    setView({ year: today.getFullYear(), month: today.getMonth() });

  const navBtn = 'btn-outline';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">
          {MONTHS[view.month]} {view.year}
        </h2>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className={navBtn}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" onClick={goToday} className={navBtn}>
            Today
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className={navBtn}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
        {/* The calendar spans every band the viewer is in, but Overview is
            one band's page — so this goes to whichever band the app is
            currently "in", and isn't offered until there is one. The band
            list resolves after mount, so this appears a beat late rather
            than pointing somewhere useless in the meantime. */}
        <span className="flex justify-end gap-2 flex-wrap ml-2 ">
          {currentBandId && (
            <Link
              href={`/bands/${currentBandId}?tab=events`}
              className="btn-outline text-wrap"
            >
              Events
            </Link>
          )}
          <Link href="/calendar/events/new" className="btn-primary">
            Add event
          </Link>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-7 gap-px bg-neutral-200 dark:bg-neutral-800">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-surface-soft py-1.5 text-center text-xs font-medium minor-text-theme-colors"
            >
              {w}
            </div>
          ))}
        </div>

        {/* One row per week. Events are drawn as bars in an overlay rather
            than as chips inside each cell, so a multi-day event is a single
            bar across the days it covers. The overlay is click-through: the
            cell underneath still owns the tap that opens the day summary,
            which is where an event is actually read. */}
        {weeks.map((week, wi) => {
          const days = week.map((d) => (d === null ? null : dateStr(d)));
          const { segments, laneCount } = layoutWeekBars(days, events);
          const minHeight = Math.max(
            MIN_CELL_PX,
            BAR_TOP_PX + laneCount * BAR_PITCH_PX + BAR_BOTTOM_PX,
          );
          return (
            <div key={wi} className="relative">
              <div className="grid grid-cols-7 gap-px bg-neutral-200 dark:bg-neutral-800">
                {week.map((d, i) => (
                  <div
                    key={i}
                    style={{ minHeight }}
                    className={
                      d === null
                        ? 'bg-neutral-50/60 dark:bg-neutral-900/40'
                        : 'bg-surface'
                    }
                  >
                    {d !== null && (
                      // The whole cell is clickable — even with no events —
                      // and opens that day's summary modal.
                      <button
                        type="button"
                        onClick={() => setSummaryDate(dateStr(d))}
                        aria-label={`Events on ${dateStr(d)}`}
                        className="flex h-full w-full flex-col items-start p-1 text-left hover:bg-surface-soft"
                      >
                        <span
                          className={
                            isToday(d)
                              ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-medium text-white'
                              : 'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-fg-muted'
                          }
                        >
                          {d}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-px px-1"
                style={{
                  top: BAR_TOP_PX,
                  gridAutoRows: `${BAR_PITCH_PX}px`,
                }}
              >
                {segments.map((seg) => (
                  <span
                    // A week-crossing event contributes one segment per week,
                    // so the column keeps the key unique within this row.
                    key={`${seg.event.id}-${seg.startCol}`}
                    title={eventLabel(seg.event)}
                    data-event-type={eventColorKey(seg.event.eventType)}
                    style={{
                      gridColumn: `${seg.startCol + 1} / span ${seg.endCol - seg.startCol + 1}`,
                      gridRow: seg.lane + 1,
                    }}
                    className={
                      'truncate bg-[var(--event-fill)] px-1 text-[0.6875rem] leading-4 text-[var(--event-accent)] ' +
                      // A cut end is drawn flat and without its accent edge,
                      // so a bar reads as continuing past the week rather
                      // than as a separate event that happens to abut it.
                      // That edge is the whole signal — an arrow glyph here
                      // rendered as an emoji box in the grid's font.
                      (seg.continuesBefore
                        ? 'rounded-l-none '
                        : 'rounded-l border-l-2 border-[var(--event-accent)] ') +
                      (seg.continuesAfter ? 'rounded-r-none' : 'rounded-r')
                    }
                  >
                    {eventLabel(seg.event)}
                    {!seg.continuesBefore && seg.event.time
                      ? ` ${formatTime12h(seg.event.time)}`
                      : ''}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {summaryDate && (
        <Modal
          onClose={() => setSummaryDate(null)}
          labelledBy="day-summary-title"
          size="sm"
        >
          <h2 id="day-summary-title" className="text-base font-semibold">
            {formatDateLong(summaryDate)}
          </h2>
          {eventsOn(summaryDate).length === 0 ? (
            <p className="mt-3 text-sm minor-text-theme-colors">
              No events on this day.
            </p>
          ) : (
            <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-auto">
              {eventsOn(summaryDate).map((ev) => {
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
              href={`/calendar/events/new?date=${summaryDate}`}
              className="btn-outline"
            >
              Add event
            </Link>
            <button
              type="button"
              onClick={() => setSummaryDate(null)}
              className="btn-ghost"
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
