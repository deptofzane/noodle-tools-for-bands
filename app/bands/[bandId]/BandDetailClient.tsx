'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BandMembersTab } from './BandMembersTab';
import { BandOverviewTab } from './BandOverviewTab';
import { BandVenuesTab } from './BandVenuesTab';
import { BandNotesTab } from './BandNotesTab';
import { BandTodosTab } from './BandTodosTab';
import {
  BAND_ACTIVE_TAB_KEY,
  BAND_TABS,
  DEFAULT_BAND_TAB,
  isBandTab,
  type BandTab,
} from './bandTabs';
import { TabStrip } from '../../TabStrip';
import { LeaveBandModal } from '../LeaveBandModal';
import { useBandData } from './bandDetailHooks';
import { LoadingBlock } from '../../Spinner';

/**
 * Band detail coordinator: fetches the band's data, owns the tab state, and
 * renders the tab bar plus the active tab (Events / Venues / Todos /
 * Notes / Polls).
 * The tab bodies live in their own components. Audio and Setlists live on
 * their own page at `/bands/[bandId]/audio`, and Chat at
 * `/bands/[bandId]/chat`.
 */
export function BandDetailClient({
  bandId,
  currentUserId,
  initialTab = DEFAULT_BAND_TAB,
  tabFromUrl = false,
}: {
  bandId: string;
  currentUserId: string;
  initialTab?: BandTab;
  /**
   * Whether `initialTab` came from an explicit `?tab=`. Can't be re-derived on
   * the client: the URL-mirror effect below strips the param for the default
   * tab before any other effect gets to read it.
   */
  tabFromUrl?: boolean;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BandTab>(initialTab);

  const router = useRouter();

  const { data, setlists, shows, venues, error, reload } = useBandData(bandId);

  // Mirror the active tab into the URL (?tab=…) so browser-back and refresh
  // restore it. Uses history.replaceState — no navigation/refetch, and it
  // doesn't add a history entry per tab switch. Overview stays paramless.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (activeTab === 'events') url.searchParams.delete('tab');
    else url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [activeTab]);

  // Persist the chosen tab so it's restored on a later visit.
  const changeTab = useCallback((tab: BandTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(BAND_ACTIVE_TAB_KEY, tab);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  // On a fresh nav to /bands/[id] (no ?tab=), restore the last-used tab. An
  // explicit ?tab= (deep link / back-nav) always wins and is remembered.
  // Reads `tabFromUrl` rather than window.location: the effect above has
  // already deleted `?tab=events` by the time this one runs.
  useEffect(() => {
    try {
      if (tabFromUrl) {
        localStorage.setItem(BAND_ACTIVE_TAB_KEY, initialTab);
        return;
      }
      const saved = localStorage.getItem(BAND_ACTIVE_TAB_KEY);
      if (isBandTab(saved)) setActiveTab(saved);
    } catch {
      // ignore
    }
    // Mount-only, as before: this decides the *initial* tab, and re-running it
    // later would yank the tab out from under someone mid-visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!data) {
    return <LoadingBlock />;
  }

  const isOwner = data.myRole === 'owner';

  return (
    <div className="flex flex-col gap-4">
      <span className="flex items-center justify-between gap-2">
        <h1 className="title-text">{data.band.name}</h1>
        {isOwner && (
          <Link href={`/bands/${bandId}/edit`} className="shrink-0 btn-outline">
            Edit band
          </Link>
        )}
      </span>

      {/* Tabs */}
      <TabStrip label="Band sections" activeKey={activeTab}>
        {BAND_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            data-tab-key={tab}
            aria-selected={activeTab === tab}
            onClick={() => changeTab(tab)}
            className={
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium capitalize transition ' +
              (activeTab === tab
                ? 'text-blue-600 dark:text-blue-400'
                : 'minor-text-theme-colors hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {tab}
          </button>
        ))}
      </TabStrip>

      {activeTab === 'polls' && (
        <BandMembersTab
          bandId={bandId}
          members={data.members}
          canManage={isOwner}
          onReload={reload}
        />
      )}

      {activeTab === 'events' && (
        <BandOverviewTab
          bandId={bandId}
          shows={shows}
          setlists={setlists}
          onLeave={() => setLeaveOpen(true)}
          onReload={reload}
        />
      )}

      {activeTab === 'venues' && (
        <BandVenuesTab bandId={bandId} venues={venues} onReload={reload} />
      )}

      {activeTab === 'todos' && (
        <BandTodosTab bandId={bandId} currentUserId={currentUserId} />
      )}

      {activeTab === 'notes' && (
        <BandNotesTab bandId={bandId} currentUserId={currentUserId} />
      )}

      {leaveOpen && (
        <LeaveBandModal
          band={{ id: bandId, name: data.band.name, role: data.myRole }}
          currentUserId={currentUserId}
          onCancel={() => setLeaveOpen(false)}
          onLeft={() => router.push('/bands')}
        />
      )}
    </div>
  );
}
