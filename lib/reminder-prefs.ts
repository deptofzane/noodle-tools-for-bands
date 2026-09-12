/**
 * Event-reminder vocabulary and defaults — the parts with no database in them.
 *
 * Split out from `lib/db/event-reminders.ts` so that importing the scheduling
 * maths doesn't build a connection pool: `lib/db/index` opens one the moment
 * it's loaded, which would make the pure tests need a database to run and
 * would drag a pool into anything that only wanted to know what "a week
 * before" means.
 */

/**
 * The event categories a reminder preference can be set for.
 *
 * These are the calendar's colour keys. They are repeated here rather than
 * imported because `lib` never reaches into `app` — `event-reminders.test.ts`
 * asserts the two lists are identical, so a category added to one and not the
 * other fails a test instead of quietly losing its preferences.
 */
export const REMINDER_CATEGORIES = [
  'show',
  'practice',
  'writing',
  'studio',
  'time-off',
  'other',
] as const;

export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

/** The three offsets, furthest out first — the order Settings shows them in. */
export const REMINDER_KINDS = [
  'event-week-before',
  'event-day-before',
  'event-day-of',
] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** How many days before the event each offset fires. */
export const REMINDER_DAYS_BEFORE: Record<ReminderKind, number> = {
  'event-week-before': 7,
  'event-day-before': 1,
  'event-day-of': 0,
};

/**
 * What someone gets before they ever open the settings.
 *
 * Shows get all three — that's the one you can't miss. Everything else gets
 * only the morning-of nudge, because three notifications for a weekly practice
 * is the noise that makes people turn the whole feature off. Time off gets
 * none: it's on the calendar so nobody books over it, not so it can be
 * announced three times.
 */
export const DEFAULT_REMINDERS: Record<
  ReminderCategory,
  Record<ReminderKind, boolean>
> = {
  show: {
    'event-week-before': true,
    'event-day-before': true,
    'event-day-of': true,
  },
  practice: {
    'event-week-before': false,
    'event-day-before': false,
    'event-day-of': true,
  },
  writing: {
    'event-week-before': false,
    'event-day-before': false,
    'event-day-of': true,
  },
  studio: {
    'event-week-before': false,
    'event-day-before': false,
    'event-day-of': true,
  },
  'time-off': {
    'event-week-before': false,
    'event-day-before': false,
    'event-day-of': false,
  },
  other: {
    'event-week-before': false,
    'event-day-before': false,
    'event-day-of': true,
  },
};

/**
 * Preset event types to the category their reminders are keyed on.
 *
 * A deliberate mirror of `BY_LABEL` in `app/calendar/eventColors.ts`, matched
 * case-insensitively on the trimmed label for the same reason: `event_type` is
 * free text, so a hand-typed "show" is still a show. Anything unrecognised —
 * a band's own invented type, or no type at all — is 'other'.
 *
 * `event-reminders.test.ts` asserts this agrees with `eventColorKey` for every
 * preset, because a type that coloured one way and reminded another would be
 * indefensible.
 */
const CATEGORY_BY_LABEL: Record<string, ReminderCategory> = {
  show: 'show',
  practice: 'practice',
  'writing session': 'writing',
  studio: 'studio',
  'time off': 'time-off',
};

export function categoryForEventType(
  eventType: string | null | undefined,
): ReminderCategory {
  if (!eventType) return 'other';
  return CATEGORY_BY_LABEL[eventType.trim().toLowerCase()] ?? 'other';
}

/** A user's explicit choices, keyed `category:kind`. Absence means default. */
export type ReminderPrefs = Map<string, boolean>;

export const prefKey = (category: string, kind: string) =>
  `${category}:${kind}`;

/**
 * Whether this user wants this offset for this kind of event.
 *
 * Pure, so the sweep can decide for a whole band from one query rather than
 * asking the database per member per event.
 */
export function wantsReminder(
  prefs: ReminderPrefs,
  category: ReminderCategory,
  kind: ReminderKind,
): boolean {
  return (
    prefs.get(prefKey(category, kind)) ?? DEFAULT_REMINDERS[category][kind]
  );
}
