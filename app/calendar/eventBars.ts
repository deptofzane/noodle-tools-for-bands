/**
 * Laying events out as bars across a week of the month grid.
 *
 * A multi-day event is one bar spanning the days it covers, rather than a
 * chip repeated on each of them — so a festival reads as one thing that lasts
 * three days instead of three separate things. That forces two problems this
 * module solves, both pure so they can be tested without a DOM:
 *
 *   1. **Weeks break bars.** An event running Friday to Monday is two bars,
 *      one ending at the right edge of its week and one starting at the left
 *      edge of the next. Each segment knows whether it continues past the
 *      edge so the rendering can flatten that end.
 *   2. **Bars need lanes.** Two overlapping events can't share a row. Each
 *      segment gets the lowest row where nothing else in that row overlaps
 *      it, which is also what tells the week row how tall to be.
 *
 * Single-day events are laid out the same way, as one-column bars. Treating
 * them separately would mean two alignment systems in one grid.
 *
 * Dates are `YYYY-MM-DD` throughout and compared as strings — that ordering
 * is the calendar ordering, and it can't be shifted by a timezone the way
 * parsing to `Date` can.
 */

export interface BarEvent {
  id: string;
  /** First day, `YYYY-MM-DD`. */
  date: string;
  /** Last day inclusive, or null when it ends the day it starts. */
  endDate: string | null;
}

export interface BarSegment<T extends BarEvent = BarEvent> {
  event: T;
  /** Row within the week, 0-based. */
  lane: number;
  /** First column this segment occupies, 0–6. */
  startCol: number;
  /** Last column, inclusive. */
  endCol: number;
  /** The event began before this segment's first day. */
  continuesBefore: boolean;
  /** The event runs past this segment's last day. */
  continuesAfter: boolean;
}

export interface WeekBars<T extends BarEvent = BarEvent> {
  segments: BarSegment<T>[];
  /** How many lanes the week needs; 0 when it has no events. */
  laneCount: number;
}

/** The event's last day — the column its bar has to reach. */
export function lastDayOf(ev: BarEvent): string {
  return ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
}

/**
 * Place a week's events into bars.
 *
 * `week` is seven cells, each the day's date or null for a padding cell from
 * an adjacent month. Bars are clipped to the real days: a padding cell shows
 * nothing today, and drawing into it would imply the grid owns a day it
 * doesn't render.
 */
export function layoutWeekBars<T extends BarEvent>(
  week: (string | null)[],
  events: T[],
): WeekBars<T> {
  // Longest first within a start date, so a week-long bar takes the top lane
  // and shorter events settle underneath it rather than fragmenting the row.
  // The id breaks remaining ties so the same input always lays out the same.
  const ordered = [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const aLast = lastDayOf(a);
    const bLast = lastDayOf(b);
    if (aLast !== bLast) return aLast > bLast ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const segments: BarSegment<T>[] = [];
  // laneEnds[lane] is the last column already taken in that lane.
  const laneEnds: number[] = [];

  for (const event of ordered) {
    const last = lastDayOf(event);

    let startCol = -1;
    let endCol = -1;
    for (let col = 0; col < week.length; col++) {
      const day = week[col];
      if (!day) continue;
      if (day < event.date || day > last) continue;
      if (startCol === -1) startCol = col;
      endCol = col;
    }
    // Nothing of this event falls on a day this week actually renders.
    if (startCol === -1) continue;

    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endCol);
    } else {
      laneEnds[lane] = endCol;
    }

    segments.push({
      event,
      lane,
      startCol,
      endCol,
      continuesBefore: event.date < week[startCol]!,
      continuesAfter: last > week[endCol]!,
    });
  }

  return { segments, laneCount: laneEnds.length };
}
