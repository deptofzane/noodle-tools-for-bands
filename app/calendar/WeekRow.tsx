import { formatTime12h } from '@/lib/format';
import { eventColorKey } from './eventColors';
import { layoutWeekBars, type BarEvent } from './eventBars';
import { eventLabel, type LabelledEvent } from './eventLabel';

// Bar geometry, in px because the overlay is positioned against the cell box
// rather than flowing inside it. `BAR_TOP_PX` clears the day number (p-1 plus
// a 24px circle); the pitch is one bar plus the gap under it.
const BAR_TOP_PX = 30;
const BAR_PITCH_PX = 18;
const BAR_BOTTOM_PX = 6;
/** Keeps a quiet week the same height it has always been. */
const MIN_CELL_PX = 96;

export type WeekRowEvent = BarEvent &
  LabelledEvent & {
    time: string | null;
  };

/**
 * One week of the calendar grid: seven day cells, with events drawn as bars
 * across the days they cover.
 *
 * Shared by the Calendar's month grid and Home's Activity week, so there is
 * one implementation of multi-day bars rather than two that drift. It knows
 * nothing about months: a cell is a `YYYY-MM-DD` string (or null for padding
 * before the 1st), which is what lets the same row show Sunday–Saturday on the
 * Calendar and a rolling today-plus-six on Home. The day number and the
 * today highlight are read off that string for the same reason.
 *
 * Events are drawn in an overlay rather than as chips inside each cell, so a
 * multi-day event is a single bar across the days it covers. The overlay is
 * click-through: the cell underneath still owns the tap that opens the day,
 * which is where an event is actually read.
 */
export function WeekRow<T extends WeekRowEvent>({
  days,
  events,
  today,
  onSelectDay,
}: {
  /** Seven cells, `YYYY-MM-DD`, or null where the month hasn't started. */
  days: (string | null)[];
  events: T[];
  /** The viewer's local today, `YYYY-MM-DD`. */
  today: string;
  onSelectDay: (day: string) => void;
}) {
  const { segments, laneCount } = layoutWeekBars(days, events);
  const minHeight = Math.max(
    MIN_CELL_PX,
    BAR_TOP_PX + laneCount * BAR_PITCH_PX + BAR_BOTTOM_PX,
  );

  return (
    <div className="relative">
      <div className="grid grid-cols-7 gap-px bg-fill-strong">
        {days.map((day, i) => (
          <div
            key={i}
            style={{ minHeight }}
            className={
              day === null
                ? 'bg-neutral-50/60 dark:bg-neutral-900/40'
                : 'bg-surface'
            }
          >
            {day !== null && (
              // The whole cell is clickable — even with no events —
              // and opens that day's summary.
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                aria-label={`Events on ${day}`}
                className="flex h-full w-full flex-col items-start p-1 text-left hover:bg-surface-soft"
              >
                <span
                  className={
                    day === today
                      ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-medium text-white'
                      : 'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-fg-muted'
                  }
                >
                  {Number(day.slice(8))}
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
            // A week-crossing event contributes one segment per week, so the
            // column keeps the key unique within this row.
            key={`${seg.event.id}-${seg.startCol}`}
            title={eventLabel(seg.event)}
            data-event-type={eventColorKey(seg.event.eventType)}
            style={{
              gridColumn: `${seg.startCol + 1} / span ${seg.endCol - seg.startCol + 1}`,
              gridRow: seg.lane + 1,
            }}
            className={
              'truncate bg-[var(--event-fill)] px-1 text-[0.6875rem] leading-4 text-[var(--event-accent)] ' +
              // A cut end is drawn flat and without its accent edge, so a bar
              // reads as continuing past the week rather than as a separate
              // event that happens to abut it. That edge is the whole signal
              // — an arrow glyph here rendered as an emoji box in the grid's
              // font.
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
}
