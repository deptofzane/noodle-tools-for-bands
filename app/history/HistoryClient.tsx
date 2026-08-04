'use client';

import { useEffect, useState } from 'react';
import { ClosedPolls } from './ClosedPolls';
import { HistoryList } from './HistoryList';
import { PastEvents } from './PastEvents';
import {
  DEFAULT_HISTORY_TAB,
  HISTORY_TABS,
  HISTORY_TAB_LABELS,
  isHistoryTab,
  type HistoryTab,
} from './historyTabs';

/** Remembers the last category, so returning lands where you left off. */
const TAB_STORAGE_KEY = 'historyTab';

/**
 * History's categories: closed conversations, closed polls, and past events.
 *
 * Each panel fetches its own data the first time it's shown and unmounts when
 * you leave it — history is browsed, not watched, so there's no reason to load
 * all three for a visit that only wanted one.
 */
export function HistoryClient({ initialTab }: { initialTab?: HistoryTab }) {
  const [activeTab, setActiveTab] = useState<HistoryTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window === 'undefined') return DEFAULT_HISTORY_TAB;
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (isHistoryTab(saved)) return saved;
    } catch {
      // ignore unavailable storage
    }
    return DEFAULT_HISTORY_TAB;
  });

  // Mirror into the URL so refresh and browser-back restore the category, and
  // remember it for a later visit. `replaceState` — no navigation, and no
  // history entry per tab switch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', url.toString());
    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore unavailable storage
    }
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="History categories"
        className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800"
      >
        {HISTORY_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ' +
              (activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {HISTORY_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'conversations' && <HistoryList />}
      {activeTab === 'polls' && <ClosedPolls />}
      {activeTab === 'events' && <PastEvents />}
    </div>
  );
}
