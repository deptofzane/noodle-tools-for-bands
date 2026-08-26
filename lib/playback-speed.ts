/**
 * Playback speed bounds, as percentages.
 *
 * A number field rather than a list of presets: half speed is for picking a
 * part out, and above 100 is for running a set faster than it plays — neither
 * is served well by a fixed ladder. The browser honours this whole range on an
 * <audio> element; Howler's documented 0.5–4.0 is guidance, not a limit it
 * enforces.
 */
export const SPEED_MIN = 25;
export const SPEED_MAX = 200;

/** A playback rate as a whole-number percentage: 1 → 100. */
export function ratePercent(rate: number): number {
  return Math.round(rate * 100);
}

/**
 * What a typed speed should become, as a playback rate.
 *
 * `null` means "leave it alone": an empty or unparseable field keeps whatever
 * speed was showing rather than resetting to 100, which would silently discard
 * a setting someone had chosen. Anything else is clamped into range.
 */
export function parseSpeedPercent(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n)) / 100;
}
