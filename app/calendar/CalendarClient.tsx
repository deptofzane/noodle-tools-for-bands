'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../PendingActionProvider';
import { formatTime12h } from '@/lib/format';

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
  date: string; // YYYY-MM-DD
  time: string | null;
}

const pad = (n: number) => n.toString().padStart(2, '0');

/**
 * Month calendar. Navigable by month, today highlighted. Fetches the
 * visible month's events and renders them into the day cells; clicking a
 * day starts a new event on that date.
 */
export function CalendarClient() {
  const router = useRouter();
  const trackPending = useTrackPending();
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [eventsByDate, setEventsByDate] = useState<
    Record<string, CalendarEvent[]>
  >({});

  const startWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (d: number) =>
    `${view.year}-${pad(view.month + 1)}-${pad(d)}`;
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
      const byDate: Record<string, CalendarEvent[]> = {};
      for (const ev of d.events) (byDate[ev.date] ??= []).push(ev);
      setEventsByDate(byDate);
    } catch {
      // Non-fatal: the grid still renders without events.
    }
  }, [view.year, view.month, daysInMonth]);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  const prevMonth = () =>
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 },
    );
  const nextMonth = () =>
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 },
    );
  const goToday = () =>
    setView({ year: today.getFullYear(), month: today.getMonth() });

  const navBtn =
    'rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">
          {MONTHS[view.month]} {view.year}
        </h2>
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
          <Link
            href="/calendar/events/new"
            className="ml-1 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500"
          >
            Add event
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="bg-neutral-50 py-1.5 text-center text-xs font-medium text-neutral-500 dark:bg-neutral-900"
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={
              'flex min-h-24 flex-col gap-1 p-1 ' +
              (d === null
                ? 'bg-neutral-50/60 dark:bg-neutral-900/40'
                : 'bg-white dark:bg-neutral-950')
            }
          >
            {d !== null && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/calendar/events/new?date=${dateStr(d)}`)
                  }
                  aria-label={`Add event on ${dateStr(d)}`}
                  className="self-start"
                >
                  <span
                    className={
                      isToday(d)
                        ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-medium text-white'
                        : 'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }
                  >
                    {d}
                  </span>
                </button>
                <div className="flex flex-col gap-0.5">
                  {(eventsByDate[dateStr(d)] ?? []).map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/calendar/events/${ev.id}`}
                      title={ev.title}
                      className="truncate rounded bg-cyan-50 px-1 py-0.5 text-[11px] text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-950 dark:text-cyan-300 dark:hover:bg-cyan-900"
                    >
                      {ev.time ? `${formatTime12h(ev.time)} ` : ''}
                      {ev.title}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
