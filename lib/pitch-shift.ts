/**
 * Pitch shift bounds, in half-steps. An octave either way: past that the
 * shifter's artefacts outweigh any practice use.
 */
export const PITCH_MIN = -12;
export const PITCH_MAX = 12;

const clamp = (n: number) => Math.min(PITCH_MAX, Math.max(PITCH_MIN, n));

/** The shift one arrow tap away, clamped into range. */
export function stepPitch(semitones: number, direction: 1 | -1): number {
  return clamp(semitones + direction);
}

/**
 * What a typed shift should become. Mirrors `parseSpeedPercent`: `null` keeps
 * whatever was showing rather than resetting to 0, and anything else is taken
 * as a whole number of half-steps and clamped.
 */
export function parsePitch(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return clamp(n);
}

/**
 * Each song's shift, kept on this device so a song practised a step down
 * opens a step down next time. Keyed by conversation id, so every audio
 * version of a song shares one setting. Storage failures are ignored: a lost
 * setting just means starting from 0.
 */
const STORAGE_KEY = 'pitchByKey';

function loadMap(): Record<string, number> {
  try {
    const obj = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (obj && typeof obj === 'object') return obj as Record<string, number>;
  } catch {
    // malformed or unavailable
  }
  return {};
}

export function loadPitch(key: string): number {
  const n = loadMap()[key];
  return typeof n === 'number' && Number.isFinite(n) ? clamp(Math.trunc(n)) : 0;
}

export function savePitch(key: string, semitones: number): void {
  const map = loadMap();
  if (semitones === 0) delete map[key];
  else map[key] = semitones;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}
