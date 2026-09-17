'use client';

import { useMemo, useState } from 'react';
import { MonthGrid, type MonthView } from '../scheduling/MonthGrid';
import { useMonthEvents } from '../scheduling/useMonthEvents';
import { visibleInBand } from '../scheduling/bandFilter';
import { ActivitySection } from './ActivitySection';

/** Where the month on screen is remembered for this visit. */
const MONTH_KEY = 'homeActivityMonth';

/**
 * The month to open on: the one left on screen earlier this visit, else today's.
 *
 * sessionStorage rather than localStorage on purpose — coming back from another
 * page should land where you were, but opening the app next week should show
 * next week, not a month you paged to and forgot.
 *
 * Read in the `useState` initializer, which is only hydration-safe because this
 * never renders on the server: `HomeTabs` mounts the open panel after an effect
 * has read the saved tab. Reading it here rather than in an effect also avoids
 * fetching today's month first and the remembered one straight after.
 */
function initialMonth(): MonthView {
  const today = new Date();
  const fallback = { year: today.getFullYear(), month: today.getMonth() };
  try {
    const saved = JSON.parse(sessionStorage.getItem(MONTH_KEY) ?? 'null');
    if (
      Number.isInteger(saved?.year) &&
      Number.isInteger(saved?.month) &&
      saved.month >= 0 &&
      saved.month <= 11
    ) {
      return { year: saved.year, month: saved.month };
    }
  } catch {
    // unavailable or unparseable — today's month it is
  }
  return fallback;
}

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
  const [view, setView] = useState<MonthView>(initialMonth);
  const events = useMonthEvents(view);

  // Remembered on every change, so leaving /home — or just switching to the
  // Notifications tab, which unmounts this panel — comes back to the same month.
  const changeView = (next: MonthView) => {
    setView(next);
    try {
      sessionStorage.setItem(MONTH_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — the month still holds for as long as we're mounted
    }
  };

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
      <MonthGrid view={view} onViewChange={changeView} events={shown} />
    </ActivitySection>
  );
}
