/**
 * Small presentation helpers shared across the listing/notes UIs. Pure and
 * client-safe — no server-only imports.
 */

/** Compact "time ago" label, falling back to a date past ~30 days. */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** Local midnight for a date, so "same day" means the reader's calendar day. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Timestamp read by the calendar, not by elapsed time:
 *
 *   today      → "just now" / "12m ago" / "3h ago"
 *   yesterday  → "Yesterday"
 *   older      → the date it was created
 *
 * Calendar days rather than 24-hour blocks is the point. At 1am, something
 * posted at 11pm last night is a day ago to a reader and two hours ago to a
 * clock — "Yesterday" is the one that matches what they remember. The same
 * cut is why "3h ago" can't survive into the next morning.
 *
 * Rounding the day difference absorbs the 23- and 25-hour days that daylight
 * saving produces, which would otherwise shift the boundary twice a year.
 *
 * Separate from `formatRelativeTime` rather than an option on it: that one
 * labels a stream, where "2d ago" is exactly the useful phrasing, and it has
 * nine other callers that should keep it.
 */
export function formatTimeAgoOrDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const days = Math.round(
    (startOfLocalDay(new Date()) - startOfLocalDay(date)) / 86_400_000,
  );
  // `<= 0` also covers a clock-skewed future timestamp, which reads as today.
  if (days <= 0) return formatRelativeTime(iso);
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString();
}

/**
 * Human label for a user: their name, else email, else "someone". Pass
 * `currentUserId` to render the viewer's own actions as "you".
 */
export function actorLabel(
  by:
    | { id?: string; name?: string | null; email?: string | null }
    | null
    | undefined,
  currentUserId?: string,
): string {
  if (!by) return 'someone';
  if (currentUserId && by.id === currentUserId) return 'you';
  if (by.name) return by.name;
  if (by.email) return by.email;
  return 'someone';
}

/**
 * A file size, for showing next to a name.
 *
 * 1024-based with KB/MB labels — the convention people read on their own
 * machines, rather than the strictly-correct KiB. One decimal below 10 so a
 * 1.4 MB take doesn't round to "1 MB" and look identical to a 1.4x smaller
 * one; none above, where the extra digit is noise on a number nobody is
 * adding up.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Format `seconds` as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "2026-07-15" → "Wednesday, July 15, 2026" (UTC to avoid a day shift). */
export function formatDateLong(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * An event's dates: one day, or a range when it spans several.
 *
 * `format` picks the underlying formatter, so a list row stays terse ("Jul
 * 17 – Jul 19, 2026") while a detail page reads long. A null or same-day end
 * is a single day and formats exactly as it did before end dates existed —
 * which is most events, and they shouldn't grow a dash.
 */
export function formatDateRange(
  date: string,
  endDate: string | null,
  format: (s: string) => string = formatDateLong,
): string {
  if (!endDate || endDate <= date) return format(date);
  return `${format(date)} – ${format(endDate)}`;
}

/** "2026-07-15" → "Jul 15, 2026" (UTC to avoid a day shift). */
export function formatDateShort(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "19:30" → "7:30 PM". */
export function formatTime12h(s: string): string {
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  let h = Number(m[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

/** Default gap between an event's start and end time, in hours. */
export const DEFAULT_EVENT_DURATION_HOURS = 2;

/**
 * Add whole hours to an `HH:MM` clock time, wrapping past midnight. Returns
 * `HH:MM`, or null if the input isn't a valid time.
 */
export function addHoursToTime(time: string, hours: number): string | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const day = 24 * 60;
  const total =
    (((Number(m[1]) * 60 + Number(m[2]) + hours * 60) % day) + day) % day;
  const p = (x: number) => x.toString().padStart(2, '0');
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
}

/** "7:00 PM – 9:00 PM", or just the start when there's no end. */
export function formatTimeRange(start: string, end: string | null): string {
  return end
    ? `${formatTime12h(start)} – ${formatTime12h(end)}`
    : formatTime12h(start);
}

/** A song's tempo/key as a compact line ("128 BPM · Am"), or null if neither. */
export function formatSongMeta(
  bpm: number | null,
  key: string | null,
): string | null {
  const parts: string[] = [];
  if (bpm != null) parts.push(`${bpm} BPM`);
  if (key) parts.push(`Key: ${key}`);
  return parts.length ? parts.join(' · ') : null;
}
