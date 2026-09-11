'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTrackPending } from '../PendingActionProvider';
import { WeekRow } from './WeekRow';
import { DaySummaryModal } from './DaySummaryModal';
import { useCurrentBand } from '../CurrentBandProvider';
import { ActionMenu, ActionMenuItem, MenuSectionLabel } from '../ActionMenu';
import { useNavigate } from '../useNavigate';

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

/**
 * Month calendar. Navigable by month, today highlighted. Fetches the
 * visible month's events and renders them into the day cells; clicking a
 * day opens a summary of that day's shows across all the user's bands.
 */
export function CalendarClient() {
  const trackPending = useTrackPending();
  const go = useNavigate();
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

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

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
        {/* Two buttons beside the month nav is more than a phone's header
            row can hold, so there they collapse into the same ⋯ menu every
            other surface uses. Both routes stay one tap away either way. */}
        <span className="ml-2 hidden flex-wrap justify-end gap-2 lg:flex">
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
        <span className="ml-2 lg:hidden">
          <ActionMenu label="Calendar actions">
            <MenuSectionLabel>Calendar</MenuSectionLabel>
            <ActionMenuItem onClick={() => go('/calendar/events/new')}>
              Add event
            </ActionMenuItem>
            {currentBandId && (
              <ActionMenuItem
                onClick={() => go(`/bands/${currentBandId}?tab=events`)}
              >
                View events
              </ActionMenuItem>
            )}
          </ActionMenu>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-7 gap-px bg-fill-strong">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-surface-soft py-1.5 text-center text-xs font-medium minor-text-theme-colors"
            >
              {w}
            </div>
          ))}
        </div>

        {/* One row per week — see WeekRow, shared with Home's Activity week. */}
        {weeks.map((week, wi) => (
          <WeekRow
            key={wi}
            days={week.map((d) => (d === null ? null : dateStr(d)))}
            events={events}
            today={todayStr}
            onSelectDay={setSummaryDate}
          />
        ))}
      </div>

      {summaryDate && (
        <DaySummaryModal
          date={summaryDate}
          events={events}
          onClose={() => setSummaryDate(null)}
        />
      )}
    </div>
  );
}
