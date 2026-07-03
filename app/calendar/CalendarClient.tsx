'use client';

import { useState } from 'react';

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

/**
 * Month calendar. Navigable by month, with today highlighted. Day cells are
 * intentionally roomy — upcoming events will render inside them.
 */
export function CalendarClient() {
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  // Leading blanks for the weekday the month starts on, then each day,
  // then trailing blanks so the grid ends on a full week.
  const startWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (d: number) =>
    today.getFullYear() === view.year &&
    today.getMonth() === view.month &&
    today.getDate() === d;

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
              'min-h-20 p-1 ' +
              (d === null
                ? 'bg-neutral-50/60 dark:bg-neutral-900/40'
                : 'bg-white dark:bg-neutral-950')
            }
          >
            {d !== null && (
              <span
                className={
                  isToday(d)
                    ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-medium text-white'
                    : 'inline-flex h-6 w-6 items-center justify-center text-xs text-neutral-600 dark:text-neutral-400'
                }
              >
                {d}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
