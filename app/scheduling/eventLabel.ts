import { eventColorKey } from './eventColors';

/**
 * What an event is called on screen.
 *
 * Almost always its title. The exception is time off, which belongs to the
 * person who booked it: "Time off - Steve" tells the band whose absence it
 * is, which is the entire content of the event.
 *
 * Derived here rather than baked into the title at creation, for two reasons:
 * the name follows a rename, and nobody can edit a time-off event to claim
 * it's someone else's. The stored title stays plain "Time off", so anything
 * that hasn't been taught about this — a notification written at insert time,
 * say — still reads sensibly.
 */
export interface LabelledEvent {
  title: string;
  eventType: string | null;
  /**
   * Display name of whoever created it; null if unknown or unnamed.
   *
   * Required, not optional: an optional field would let a surface that never
   * fetched the name compile happily and then quietly render every time-off
   * event as a nameless "Time off". Making it required turns the type into
   * the search that finds those surfaces.
   */
  createdByName: string | null;
}

/**
 * What a time-off event stores in `title`.
 *
 * The label people see is derived, but the column is NOT NULL and older
 * screens read it directly, so it holds something honest rather than blank.
 */
export const TIME_OFF_TITLE = 'Time off';

/** Whether this event's label is the creator's rather than its title. */
export function isTimeOff(eventType: string | null | undefined): boolean {
  return eventColorKey(eventType) === 'time-off';
}

export function eventLabel(ev: LabelledEvent): string {
  if (!isTimeOff(ev.eventType)) return ev.title;
  const who = ev.createdByName?.trim();
  // A creator with no name set still gets a label that reads as time off
  // rather than one that trails a dash into nothing.
  return who ? `Time off - ${who}` : 'Time off';
}
