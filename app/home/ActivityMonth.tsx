'use client';

import { useMemo, useState } from 'react';
import { MonthGrid, type MonthView } from '../scheduling/MonthGrid';
import { useMonthEvents } from '../scheduling/useMonthEvents';
import { visibleInBand } from '../scheduling/bandFilter';
import { ActivitySection } from './ActivitySection';

/**
 * Home's month calendar — the same grid the Calendar page uses, across every
 * band by default.
 *
 * It follows the Activity tab's band picker rather than the app's "current
 * band": that picker is the one control for the whole tab, and a calendar that
 * ignored it would contradict the todos and polls beside it. "All bands" is its
 * default, so this spans everything until asked otherwise.
 *
 * Its own month state and fetch, because the month on screen is what decides
 * what to load — Home's page-level fetch is a rolling nine-day window, which
 * can't answer for March.
 */
export function ActivityMonth({
  selectedBandId,
  myBandIds,
}: {
  /** '' for every band — see `visibleInBand`. */
  selectedBandId: string;
  myBandIds: ReadonlySet<string>;
}) {
  const today = new Date();
  const [view, setView] = useState<MonthView>({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const events = useMonthEvents(view);

  const shown = useMemo(
    () => events.filter((ev) => visibleInBand(ev, selectedBandId, myBandIds)),
    [events, selectedBandId, myBandIds],
  );

  return (
    <ActivitySection
      id="activity-month"
      title="Full calendar"
      count={shown.length}
      persistKey="homeActivityMonthOpen"
    >
      <MonthGrid view={view} onViewChange={setView} events={shown} />
    </ActivitySection>
  );
}
