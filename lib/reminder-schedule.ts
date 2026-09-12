import {
  REMINDER_DAYS_BEFORE,
  REMINDER_KINDS,
  type ReminderKind,
} from './reminder-prefs';
import { addDays } from './event-dates';

/**
 * The local hour reminders fire at, in the band's own zone.
 *
 * 09:00 is also the reason this file never has to reason about the hour that
 * doesn't exist on the morning the clocks go forward: that gap is at 02:00 or
 * 03:00 everywhere it happens, so a 09:00 wall time always exists.
 */
export const REMINDER_HOUR = 9;

/** What the scheduler needs to know about an event. Deliberately not a row. */
export interface ScheduledEvent {
  /** First day, `YYYY-MM-DD`. */
  date: string;
  /** Last day inclusive, or null when it ends the day it starts. */
  endDate: string | null;
  /** When the event was created — reminders never predate it. */
  createdAt: Date;
  /** The band's IANA zone. */
  timezone: string;
}

/**
 * How far `tz` is from UTC at a given instant, in milliseconds.
 *
 * Formats the instant *in that zone*, reads the parts back as though they were
 * UTC, and takes the difference. That's the only way to get a zone's offset
 * from `Intl` without shipping a timezone database, and it handles DST because
 * it asks about one specific instant rather than the zone in general.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, which renders midnight as
 * hour 24 in some locales and would put the offset a day out.
 */
export function zoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - at.getTime();
}

/**
 * The instant at which it is `hour:00` on `ymd` in `timezone`.
 *
 * Solved rather than calculated: guess that the wall time is UTC, measure the
 * zone's offset *at that guess*, and correct. Twice, because the first
 * correction can land on the other side of a DST change and so be measured
 * against the wrong offset — the second pass settles it. A third would never
 * differ; offsets don't change twice within a day.
 */
export function zonedHourToInstant(
  ymd: string,
  hour: number,
  timezone: string,
): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, hour, 0, 0);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - zoneOffsetMs(new Date(ts), timezone);
  return new Date(ts);
}

/** When a given offset's reminder for this event is due. */
export function reminderInstant(
  event: ScheduledEvent,
  kind: ReminderKind,
): Date {
  const day = addDays(event.date, -REMINDER_DAYS_BEFORE[kind]);
  return zonedHourToInstant(day, REMINDER_HOUR, event.timezone);
}

/**
 * The offsets that are due for this event as of `now` — nothing about who
 * wants them, which is a per-member question the sweep answers separately.
 *
 * Three rules, each earning its place:
 *
 *   - due when its moment has passed, so a missed run still sends late rather
 *     than skipping;
 *   - never once the event's last day is over locally, so a run that has been
 *     down for a week doesn't announce gigs that already happened;
 *   - never if its moment predates the event being created. Book a gig two
 *     days out and the week-before moment is already in the past — without
 *     this it would fire immediately, which reads as a bug rather than a
 *     reminder.
 */
export function dueReminders(event: ScheduledEvent, now: Date): ReminderKind[] {
  const lastDay =
    event.endDate && event.endDate > event.date ? event.endDate : event.date;
  // Midnight at the start of the day *after* the last one: the event is over
  // once the local clock passes it.
  const over = zonedHourToInstant(addDays(lastDay, 1), 0, event.timezone);
  if (now >= over) return [];

  return REMINDER_KINDS.filter((kind) => {
    const at = reminderInstant(event, kind);
    return now >= at && at >= event.createdAt;
  });
}
