/**
 * A practice section: the part of a song between a start and a stop point
 * that the Practice player keeps to, optionally on repeat.
 *
 * Times are seconds, kept to the centisecond — the precision the fields show.
 * The player can't actually stop that precisely (it checks once a frame, and
 * seeking an <audio> element isn't instant), but the numbers someone types
 * should be the numbers they get back.
 */

/** Shortest section allowed, in seconds. Also keeps the handles apart. */
export const MIN_SECTION = 1;

export type Section = {
  on: boolean;
  start: number;
  stop: number;
  repeat: boolean;
};

const cs = (sec: number) => Math.round(sec * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "0:30.00", or "1:02:03.25" when `withHours` — which the player passes for
 * recordings an hour or longer, so every field in one song reads the same way.
 */
export function formatSectionTime(sec: number, withHours: boolean): string {
  const total = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(total / 360_000);
  const m = Math.floor((total % 360_000) / 6000);
  const s = Math.floor((total % 6000) / 100);
  const c = total % 100;
  return withHours
    ? `${h}:${pad(m)}:${pad(s)}.${pad(c)}`
    : `${h * 60 + m}:${pad(s)}.${pad(c)}`;
}

/**
 * What a typed time means, in seconds: "m:ss.cc", "h:mm:ss.cc", or plain
 * seconds ("80.5" — quicker on a phone keypad). Decimals are optional and
 * rounded to the centisecond. `null` for anything else, which the caller
 * treats as "keep the current value".
 */
export function parseSectionTime(raw: string): number | null {
  const parts = raw.trim().split(':');
  if (parts.length > 3) return null;
  const secs = parts.pop()!;
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(secs)) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  const s = Number(secs);
  const [h, m] =
    parts.length === 2
      ? [Number(parts[0]), Number(parts[1])]
      : [0, Number(parts[0] ?? 0)];
  // Only a bare number may run past 60: "1:75" is a typo, "75" is a time.
  if (parts.length > 0 && s >= 60) return null;
  if (parts.length === 2 && m >= 60) return null;
  return cs(h * 3600 + m * 60 + s);
}

/** A start point: in the song, and at least `MIN_SECTION` before the stop. */
export function clampStart(start: number, stop: number): number {
  return cs(Math.max(0, Math.min(start, stop - MIN_SECTION)));
}

/** A stop point: in the song, and at least `MIN_SECTION` after the start. */
export function clampStop(stop: number, start: number, duration: number): number {
  return cs(Math.min(duration, Math.max(stop, start + MIN_SECTION)));
}

/**
 * Where a seek lands while a section is on. Before the start clamps to the
 * start; at or past the stop goes to the start too — clamping to the stop
 * would end the section the instant it landed.
 */
export function seekInSection(
  t: number,
  { start, stop }: Pick<Section, 'start' | 'stop'>,
): number {
  return t < start || t >= stop ? start : t;
}

/**
 * The saved section for one version of one song, on this device. Keyed by
 * both, since versions of a song put the same passage at different times.
 * Storage failures are ignored: a lost setting just means starting over.
 */
const STORAGE_KEY = 'practiceSectionByKey';

export const sectionKey = (conversationId: string, versionId: string) =>
  `${conversationId}:${versionId}`;

function loadMap(): Record<string, unknown> {
  try {
    const obj = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (obj && typeof obj === 'object') return obj as Record<string, unknown>;
  } catch {
    // malformed or unavailable
  }
  return {};
}

export function loadSection(key: string): Section | null {
  const v = loadMap()[key] as Partial<Section> | undefined;
  if (
    !v ||
    typeof v.on !== 'boolean' ||
    typeof v.repeat !== 'boolean' ||
    !Number.isFinite(v.start) ||
    !Number.isFinite(v.stop)
  ) {
    return null;
  }
  return { on: v.on, start: v.start!, stop: v.stop!, repeat: v.repeat };
}

export function saveSection(key: string, section: Section): void {
  const map = loadMap();
  map[key] = section;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}
