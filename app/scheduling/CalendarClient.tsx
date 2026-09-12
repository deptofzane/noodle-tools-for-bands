'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTrackPending } from '../PendingActionProvider';
import { MonthGrid, monthRange, type MonthView } from './MonthGrid';
import { useCurrentBand } from '../CurrentBandProvider';
import { visibleInBand } from './bandFilter';
import { ActionMenu, ActionMenuItem, MenuSectionLabel } from '../ActionMenu';
import { useNavigate } from '../useNavigate';

interface CalendarEvent {
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
 * The Calendar page's month view: the current band's events, plus anything you
 * were personally invited to — see `visibleInBand`. Home's Activity tab builds
 * the same `MonthGrid` across every band.
 *
 * The month is fetched unfiltered and narrowed here rather than by the API, so
 * changing band costs no request and can never show a spinner. Nothing renders
 * until the band list has resolved: `bandId` is '' both while it's in flight
 * and when the user has no bands, and showing every band's events for that
 * frame is a visible flash of the wrong thing.
 */
export function CalendarClient() {
  const trackPending = useTrackPending();
  const go = useNavigate();
  const today = new Date();
  const [view, setView] = useState<MonthView>({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { bandId: currentBandId, bands, loaded } = useCurrentBand();

  const myBandIds = useMemo(
    () => new Set(bands.map((b) => b.id)),
    [bands],
  );
  const shown = loaded
    ? events.filter((ev) => visibleInBand(ev, currentBandId, myBandIds))
    : [];

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

  return (
    <MonthGrid
      view={view}
      onViewChange={setView}
      events={shown}
      actions={
        <>
          {/* The event list used to be reachable from here; it's the Events
              pill above now, so this is down to the one action the calendar
              itself doesn't offer. The phone keeps it in the same ⋯ menu
              every other surface uses rather than in the month-nav row. */}
          <span className="ml-2 hidden flex-wrap justify-end gap-2 lg:flex">
            <Link href="/scheduling/events/new" className="btn-primary">
              Add event
            </Link>
          </span>
          <span className="ml-2 lg:hidden">
            <ActionMenu label="Calendar actions">
              <MenuSectionLabel>Calendar</MenuSectionLabel>
              <ActionMenuItem onClick={() => go('/scheduling/events/new')}>
                Add event
              </ActionMenuItem>
            </ActionMenu>
          </span>
        </>
      }
    />
  );
}
