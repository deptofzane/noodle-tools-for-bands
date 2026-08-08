/**
 * Minimal iCalendar (RFC 5545) builder for the read-only calendar
 * subscription feed. Pure string work — no DB, no Node built-ins — so it's
 * cheap to unit-test.
 *
 * Design choices (see the ICS-feed spec):
 *   - Timed events use *floating* local time (no TZID, no `Z`): a bare
 *     `DTSTART:YYYYMMDDTHHMMSS` renders in the viewer's own timezone. We don't
 *     store a timezone on events, so this keeps "7pm" reading as 7pm without
 *     inventing one.
 *   - Events with no time are all-day (`VALUE=DATE`, exclusive next-day DTEND).
 *   - Timed events with no stored end get a default duration (2h).
 */

const UID_DOMAIN = 'noodle.band';
const DEFAULT_PRODID = '-//Noodle//Calendar//EN';
export const DEFAULT_EVENT_DURATION_MINUTES = 120;

export interface IcsEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM start, or null for an all-day event
  /**
   * HH:MM end. When set (and earlier than or equal to `time`) it's treated as
   * the next day. When null, a timed event falls back to the default duration.
   */
  endTime: string | null;
  location: string | null;
  /** Pre-composed DESCRIPTION text (details, setlist, deep link), or null. */
  description: string | null;
  /** Deep link back to the event in the app, or null. */
  url: string | null;
  /** Drives DTSTAMP / LAST-MODIFIED so clients treat edits as updates. */
  updatedAt: Date;
}

export interface BuildCalendarOptions {
  /** Shown as the calendar's name in most clients (X-WR-CALNAME). */
  name: string;
  events: IcsEvent[];
  prodId?: string;
  defaultDurationMinutes?: number;
}

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line to <=75 octets per RFC 5545 §3.1: continuation lines
 * begin with a single space, which counts toward the 75. Never splits inside
 * a multi-byte character.
 */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  const segments: string[] = [];
  let cur = '';
  let curBytes = 0;
  let first = true;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    const limit = first ? 75 : 74; // continuation reserves 1 octet for the space
    if (curBytes + chBytes > limit) {
      segments.push(cur);
      cur = ch;
      curBytes = chBytes;
      first = false;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  segments.push(cur);
  return segments.join('\r\n ');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Treat the wall-clock (date, time) as if it were UTC so date arithmetic
 * (adding minutes/days) is host-timezone independent. We only ever read the
 * components back out as a floating value, so the "UTC" framing never leaks.
 */
function wallClockToDate(dateStr: string, timeStr: string | null): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr ?? '00:00').split(':').map(Number);
  return new Date(
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0),
  );
}

/** `YYYYMMDD` from a Date's UTC components. */
function dateCompact(dt: Date): string {
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

/** `YYYYMMDDTHHMMSS` (floating) from a Date's UTC components. */
function dateTimeCompact(dt: Date): string {
  return `${dateCompact(dt)}T${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}${pad2(dt.getUTCSeconds())}`;
}

/** `YYYYMMDDTHHMMSSZ` — a UTC timestamp, for DTSTAMP / LAST-MODIFIED. */
export function formatUtcStamp(dt: Date): string {
  return `${dateTimeCompact(dt)}Z`;
}

function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function textProp(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

function buildVEvent(ev: IcsEvent, durationMinutes: number): string {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(prop('UID', `${ev.id}@${UID_DOMAIN}`));
  lines.push(prop('DTSTAMP', formatUtcStamp(ev.updatedAt)));

  if (ev.time) {
    const start = wallClockToDate(ev.date, ev.time);
    let end: Date;
    if (ev.endTime) {
      end = wallClockToDate(ev.date, ev.endTime);
      // An end at or before the start means it runs into the next day.
      if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + 24 * 60 * 60_000);
      }
    } else {
      end = new Date(start.getTime() + durationMinutes * 60_000);
    }
    lines.push(prop('DTSTART', dateTimeCompact(start)));
    lines.push(prop('DTEND', dateTimeCompact(end)));
  } else {
    // All-day: DTEND is exclusive, so it lands on the next day.
    const start = wallClockToDate(ev.date, null);
    const end = new Date(start.getTime() + 24 * 60 * 60_000);
    lines.push(prop('DTSTART;VALUE=DATE', dateCompact(start)));
    lines.push(prop('DTEND;VALUE=DATE', dateCompact(end)));
  }

  lines.push(textProp('SUMMARY', ev.title));
  if (ev.location) lines.push(textProp('LOCATION', ev.location));
  if (ev.description) lines.push(textProp('DESCRIPTION', ev.description));
  if (ev.url) lines.push(prop('URL', ev.url));
  lines.push('STATUS:CONFIRMED');
  lines.push(prop('LAST-MODIFIED', formatUtcStamp(ev.updatedAt)));
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/** Render a full VCALENDAR document (CRLF line endings, trailing CRLF). */
export function buildCalendar(opts: BuildCalendarOptions): string {
  const duration =
    opts.defaultDurationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    prop('PRODID', opts.prodId ?? DEFAULT_PRODID),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    textProp('X-WR-CALNAME', opts.name),
    ...opts.events.map((ev) => buildVEvent(ev, duration)),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
