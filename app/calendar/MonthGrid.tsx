'use client';

import { useState, type ReactNode } from 'react';
import { WeekRow } from './WeekRow';
import { DaySummaryModal, type DaySummaryEvent } from './DaySummaryModal';

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

const pad = (n: number) => n.toString().padStart(2, '0');

/** The month on screen. Owned by the caller, because it drives the fetch. */
export interface MonthView {
  year: number;
  /** 0-11, as `Date` counts them. */
  month: number;
}

/** The `YYYY-MM-DD` bounds of a month — what to ask `/api/events` for. */
export function monthRange(view: MonthView): { from: string; to: string } {
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const m = pad(view.month + 1);
  return {
    from: `${view.year}-${m}-01`,
    to: `${view.year}-${m}-${pad(daysInMonth)}`,
  };
}

/**
 * A navigable month calendar: the month's name, ‹ Today › nav, the weekday
 * header, and a `WeekRow` per week. Tapping a day opens its `DaySummaryModal`.
 *
 * Presentational — it holds no events of its own and does no fetching. The
 * caller owns `view` because the visible month is what decides which events to
 * load, and passes the matching `events` in; `monthRange` turns a view into
 * the range to ask for. That's what lets the Calendar page show one band and
 * Home's Activity tab show every band from the same grid.
 *
 * `actions` is rendered opposite the month nav — the Calendar's Add event and
 * View events buttons live there, and Home passes nothing.
 */
export function MonthGrid<T extends DaySummaryEvent>({
  view,
  onViewChange,
  events,
  actions,
}: {
  view: MonthView;
  onViewChange: (view: MonthView) => void;
  events: T[];
  actions?: ReactNode;
}) {
  // The day whose summary is open (YYYY-MM-DD), or null.
  const [summaryDate, setSummaryDate] = useState<string | null>(null);

  const today = new Date();
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

  const prevMonth = () =>
    onViewChange(
      view.month === 0
        ? { year: view.year - 1, month: 11 }
        : { ...view, month: view.month - 1 },
    );
  const nextMonth = () =>
    onViewChange(
      view.month === 11
        ? { year: view.year + 1, month: 0 }
        : { ...view, month: view.month + 1 },
    );
  const goToday = () =>
    onViewChange({ year: today.getFullYear(), month: today.getMonth() });

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
        {actions}
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
