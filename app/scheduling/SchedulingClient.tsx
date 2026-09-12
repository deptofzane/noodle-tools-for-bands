'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PillTabs } from '../PillTabs';
import { useCurrentBand } from '../CurrentBandProvider';
import { LoadingBlock } from '../Spinner';
import { CalendarClient } from './CalendarClient';
import { BandOverviewTab } from '../bands/[bandId]/BandOverviewTab';
import { BandVenuesTab } from '../bands/[bandId]/BandVenuesTab';
import { useBandData } from '../bands/[bandId]/bandDetailHooks';
import {
  SCHEDULING_VIEWS,
  type SchedulingView,
} from './schedulingViews';

const LABELS: Record<SchedulingView, string> = {
  calendar: 'Calendar',
  events: 'Events',
  venues: 'Venues',
};

/**
 * Scheduling: the month calendar, the current band's events, and its venues,
 * behind three pills.
 *
 * Events and Venues used to be tabs on the band page, where the band came from
 * the route. Here it comes from `useCurrentBand`, so both wait for the band
 * list to resolve — `bandId` is '' while it's in flight *and* when the user has
 * no bands, and asking the API for band `''` fetches `/api/bands//events`.
 *
 * Only the open view is mounted, so sitting on Calendar costs none of the
 * band's four requests. Switching between Events and Venues keeps `BandPanels`
 * mounted, so it doesn't refetch.
 */
export function SchedulingClient({
  initialView,
}: {
  initialView: SchedulingView;
}) {
  const [view, setView] = useState<SchedulingView>(initialView);
  const { bandId, loaded } = useCurrentBand();

  // Mirror the view into the URL so refresh and browser-back restore it, and
  // so the ☰ drawer can link straight to a pill. `replaceState` rather than a
  // navigation: no refetch, and no history entry per pill tap. Calendar is the
  // default and stays paramless, as the band page does with its own tabs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (view === 'calendar') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [view]);

  return (
    <div className="flex flex-col gap-4">
      <PillTabs
        label="Scheduling"
        idPrefix="scheduling-tab"
        controls="scheduling-tabpanel"
        activeKey={view}
        onChange={(key) => setView(key as SchedulingView)}
        tabs={SCHEDULING_VIEWS.map((v) => ({ key: v, label: LABELS[v] }))}
      />

      <div
        role="tabpanel"
        id="scheduling-tabpanel"
        aria-labelledby={`scheduling-tab-${view}`}
      >
        {view === 'calendar' ? (
          <CalendarClient />
        ) : !loaded ? (
          <LoadingBlock />
        ) : !bandId ? (
          <NoBand view={view} />
        ) : (
          <BandPanels bandId={bandId} view={view} />
        )}
      </div>
    </div>
  );
}

/** The current band's events or venues. One component, so switching between
 *  the two doesn't remount the fetch. */
function BandPanels({
  bandId,
  view,
}: {
  bandId: string;
  view: 'events' | 'venues';
}) {
  const { data, setlists, shows, venues, error, reload } = useBandData(bandId);

  if (error) {
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }
  if (!data) return <LoadingBlock />;

  return view === 'events' ? (
    <BandOverviewTab
      bandId={bandId}
      shows={shows}
      setlists={setlists}
      onReload={reload}
    />
  ) : (
    <BandVenuesTab bandId={bandId} venues={venues} onReload={reload} />
  );
}

/** Both of these lists belong to a band, so there's nothing to show without
 *  one. The calendar still works — it has personal invites to fall back on. */
function NoBand({ view }: { view: 'events' | 'venues' }) {
  return (
    <p className="rounded-lg border border-line px-4 py-3 text-sm minor-text-theme-colors">
      {view === 'events' ? 'Events' : 'Venues'} belong to a band.{' '}
      <Link href="/bands" className="font-medium text-accent hover:underline">
        Join or create one
      </Link>{' '}
      to get started.
    </p>
  );
}
