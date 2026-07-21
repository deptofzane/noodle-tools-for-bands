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

/**
 * Human label for a user: their name, else email, else "someone". Pass
 * `currentUserId` to render the viewer's own actions as "you".
 */
export function actorLabel(
  by: { id?: string; name?: string | null; email?: string | null } | null | undefined,
  currentUserId?: string,
): string {
  if (!by) return 'someone';
  if (currentUserId && by.id === currentUserId) return 'you';
  if (by.name) return by.name;
  if (by.email) return by.email;
  return 'someone';
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
  return end ? `${formatTime12h(start)} – ${formatTime12h(end)}` : formatTime12h(start);
}

/** A song's tempo/key as a compact line ("128 BPM · Am"), or null if neither. */
export function formatSongMeta(
  bpm: number | null,
  key: string | null,
): string | null {
  const parts: string[] = [];
  if (bpm != null) parts.push(`${bpm} BPM`);
  if (key) parts.push(key);
  return parts.length ? parts.join(' · ') : null;
}
