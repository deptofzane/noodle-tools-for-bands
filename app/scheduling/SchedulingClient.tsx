'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PillTabs } from '../PillTabs';
import { useCurrentBand } from '../CurrentBandProvider';
import { LoadingBlock } from '../Spinner';
import { CalendarClient } from './CalendarClient';
import { EventsPanel } from './EventsPanel';
import { VenuesPanel } from './VenuesPanel';
import { useBandSchedulingData } from '../bands/[bandId]/bandDetailHooks';
import {
  DEFAULT_SCHEDULING_VIEW,
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
  /** The server's reading of `?view=`, used until the client has its own. */
  initialView: SchedulingView;
}) {
  const router = useRouter();
  const { bandId, loaded } = useCurrentBand();

  /*
   * The view comes straight from the prop — the server's reading of `?view=` —
   * with no `useState` copy of it.
   *
   * There used to be a copy, mirrored back out with `history.replaceState`,
   * and the ☰ drawer's Events and Venues links broke on it: a same-route
   * navigation re-renders the server shell without remounting this component,
   * so `useState` kept its first value and ignored every later prop. Props
   * themselves update fine, so reading this one directly is the whole fix.
   *
   * The write side must be `router.replace`, not `replaceState`: the router has
   * to know the URL changed, or the prop it feeds back here goes stale.
   * `replace` so pill taps don't stack history entries, and no scroll reset
   * since the pills sit at the top of what's changing.
   */
  const view = initialView;

  const choose = (next: SchedulingView) =>
    router.replace(
      next === DEFAULT_SCHEDULING_VIEW
        ? '/scheduling'
        : `/scheduling?view=${next}`,
      { scroll: false },
    );

  return (
    <div className="flex flex-col gap-4">
      <PillTabs
        label="Scheduling"
        idPrefix="scheduling-tab"
        controls="scheduling-tabpanel"
        activeKey={view}
        onChange={(key) => choose(key as SchedulingView)}
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
  const { data, setlists, shows, venues, error, reload } =
    useBandSchedulingData(bandId);

  if (error) {
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }
  if (!data) return <LoadingBlock />;

  return view === 'events' ? (
    <EventsPanel
      bandId={bandId}
      shows={shows}
      setlists={setlists}
      onReload={reload}
    />
  ) : (
    <VenuesPanel bandId={bandId} venues={venues} onReload={reload} />
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
