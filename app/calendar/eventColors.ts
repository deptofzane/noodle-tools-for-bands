/**
 * Which colour an event wears on the calendar.
 *
 * The colours themselves live in globals.css as `--event-accent` and
 * `--event-fill`, keyed off the `data-event-type` attribute this returns, so
 * a surface only has to set the attribute and read the two variables. Putting
 * them in CSS rather than a JS map is what lets the dark set apply through
 * `.dark` without every component knowing which theme it's in.
 */
export const EVENT_COLOR_KEYS = [
  'show',
  'practice',
  'writing',
  'studio',
  'other',
] as const;

export type EventColorKey = (typeof EVENT_COLOR_KEYS)[number];

/** Preset labels (see EVENT_TYPE_PRESETS) to their colour key. */
const BY_LABEL: Record<string, EventColorKey> = {
  show: 'show',
  practice: 'practice',
  'writing session': 'writing',
  studio: 'studio',
};

/**
 * An event's colour key. Anything typed in by hand — and anything with no
 * type at all — shares the muted "other" colour: an event nobody categorised
 * shouldn't be the loudest thing on the week.
 *
 * Matched case-insensitively, so a hand-typed "show" still reads as a show.
 */
export function eventColorKey(eventType: string | null | undefined) {
  if (!eventType) return 'other';
  return BY_LABEL[eventType.trim().toLowerCase()] ?? 'other';
}
