/**
 * When an event is considered "finished", as a local Date. Shared by the
 * Upcoming and Recent home sections so an event moves cleanly from one to the
 * other the moment it ends (both compute against the viewer's own clock).
 */
export interface TimedEvent {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM start, or null for an all-day event
  endTime: string | null; // HH:MM end
}

export function completionInstant(ev: TimedEvent): Date {
  const [y, m, d] = ev.date.split('-').map(Number);
  if (!ev.time) {
    // All-day: finishes at the end of its day (i.e. start of the next day).
    return new Date(y!, m! - 1, d! + 1, 0, 0, 0, 0);
  }
  const end = ev.endTime ?? ev.time;
  const [eh, em] = end.split(':').map(Number);
  const dt = new Date(y!, m! - 1, d!, eh!, em!, 0, 0);
  // An end at or before the start ran past midnight into the next day.
  if (ev.endTime) {
    const [sh, sm] = ev.time.split(':').map(Number);
    if (eh! < sh! || (eh! === sh! && em! <= sm!)) dt.setDate(dt.getDate() + 1);
  }
  return dt;
}
