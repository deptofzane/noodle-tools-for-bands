/**
 * Event date parsing shared by the create and edit endpoints, so the two
 * can't disagree about what a valid range is.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type EndDateResult =
  | { ok: true; endDate: string | null }
  | { ok: false; message: string };

/**
 * Read a request's `endDate` against its start `date`.
 *
 * Absent, blank, or the same day all mean "ends the day it starts", which is
 * stored as null — the one spelling every single-day event has had since
 * before multi-day events existed.
 *
 * An end *before* the start is rejected rather than quietly normalized: it's
 * almost always a typo in the second date, and silently dropping it would
 * show a one-day event where someone meant a week.
 */
export function parseEndDate(date: string, raw: unknown): EndDateResult {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { ok: true, endDate: null };
  if (!DATE_RE.test(value)) {
    return { ok: false, message: 'End date must be a valid date.' };
  }
  if (value < date) {
    return { ok: false, message: 'End date can’t be before the start date.' };
  }
  return { ok: true, endDate: value === date ? null : value };
}

/**
 * Every day an event covers, as `YYYY-MM-DD`, start through end inclusive.
 *
 * Built by stepping a UTC date so it can't be shifted by the runtime's
 * timezone — these are calendar days, not instants, and `new Date('2026-08-04')`
 * parsed as UTC then read with local getters is exactly how a day goes missing
 * west of Greenwich.
 */
export function eventDays(date: string, endDate: string | null): string[] {
  const last = endDate && endDate > date ? endDate : date;
  const days: string[] = [];
  const cursor = new Date(`${date}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    return [date];
  }
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Whether an event covers more than one day. */
export function isMultiDay(date: string, endDate: string | null): boolean {
  return Boolean(endDate && endDate > date);
}

/**
 * `date` moved by `days` calendar days, as `YYYY-MM-DD`.
 *
 * Steps a UTC date for the same reason `eventDays` does: these are calendar
 * days, not instants, so stepping in local time lands on the wrong day across
 * a DST boundary.
 */
export function addDays(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return date;
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/**
 * How many days beyond its start an event runs — 0 when it ends the day it
 * starts. Cloning remembers this so a copied festival keeps its length once a
 * new start date is picked, rather than collapsing to a single day.
 */
export function daySpan(date: string, endDate: string | null): number {
  if (!endDate || endDate <= date) return 0;
  const start = new Date(`${date}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  // Both are UTC midnights, so the difference is whole days exactly.
  return Math.round((end - start) / 86_400_000);
}
