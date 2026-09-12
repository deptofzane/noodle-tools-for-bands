'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTrackPending } from '../PendingActionProvider';
import { monthRange, type MonthView } from './MonthGrid';

/** An event as `/api/events` returns it — the fields a month view renders. */
export interface CalendarEvent {
  id: string;
  bandId: string;
  title: string;
  date: string; // YYYY-MM-DD start
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  eventType: string | null;
  /** Display name of whoever created it — see `eventLabel`. */
  createdByName: string | null;
  bandName: string;
  location: string | null;
  venueName: string | null;
  venueAddress: string | null;
}

/**
 * Every event the viewer can see in `view`'s month, refetched as they page
 * through months.
 *
 * Deliberately unfiltered: both callers narrow to a band themselves, and
 * fetching the whole month means changing band is instant and can't spin. One
 * hook rather than two copies of this, because the Calendar page and Home's
 * Activity tab ask the same question of the same endpoint.
 */
export function useMonthEvents(view: MonthView): CalendarEvent[] {
  const trackPending = useTrackPending();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const load = useCallback(async () => {
    const { from, to } = monthRange(view);
    try {
      const r = await fetch(`/api/events?from=${from}&to=${to}`, {
        cache: 'no-store',
      });
      if (!r.ok) return;
      const d = (await r.json()) as { events: CalendarEvent[] };
      setEvents(d.events);
    } catch {
      // Non-fatal: the grid still renders without events.
    }
  }, [view]);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  return events;
}
