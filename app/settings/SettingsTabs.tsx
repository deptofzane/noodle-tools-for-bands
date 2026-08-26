'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TabStrip } from '../TabStrip';

export interface SettingsTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Where the last-used tab is remembered. Read on a paramless visit to
 * `/settings`, so anything that wants to send someone to a particular tab has
 * to set `?tab=` too (see the Google-connect `next=` values in page.tsx).
 *
 * Unlike the band page's key this stays in the client module: the server page
 * builds the tab list itself and has no need to validate an id, and every
 * export of a 'use client' module that a server component imports becomes a
 * client reference.
 */
const ACTIVE_TAB_KEY = 'settingsActiveTab';

/**
 * Client tab switcher for the Settings page. Panel content is rendered on
 * the server and passed in as `content`, so server-only bits (session data,
 * server-action forms like Sign out) keep working inside the tabs.
 *
 * The selected tab survives navigating away and back, the same way the band
 * page's tabs do: it's mirrored into `?tab=` for browser-back and refresh, and
 * saved to localStorage for a later paramless visit.
 */
export function SettingsTabs({
  tabs,
  initialTabId,
}: {
  tabs: SettingsTab[];
  initialTabId?: string;
}) {
  const defaultTabId = tabs[0]?.id ?? '';
  /**
   * The tab an explicit `?tab=` asked for, or null. Derived from the prop
   * rather than the URL because the mirror effect below deletes the param for
   * the default tab — by the time the restore effect runs, the URL no longer
   * says whether it was ever there.
   *
   * Validated against the tabs actually rendered, not a fixed list: Calendar
   * only exists once a feed token does, so a stale `?tab=calendar` (or a saved
   * one) has to fall back rather than blank the page.
   */
  const fromUrl =
    initialTabId && tabs.some((t) => t.id === initialTabId)
      ? initialTabId
      : null;

  const [active, setActive] = useState(fromUrl ?? defaultTabId);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  // Mirror the active tab into the URL (?tab=…) so browser-back and refresh
  // restore it. Uses history.replaceState — no navigation/refetch, and it
  // doesn't add a history entry per tab switch. Account (the default) stays
  // paramless. Only `tab` is touched, so `?link=` outcomes survive a switch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (active === defaultTabId) url.searchParams.delete('tab');
    else url.searchParams.set('tab', active);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [active, defaultTabId]);

  // Persist the chosen tab so it's restored on a later visit.
  const changeTab = useCallback((id: string) => {
    setActive(id);
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, id);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  // On a fresh nav to /settings (no ?tab=), restore the last-used tab. An
  // explicit ?tab= (deep link / back-nav) always wins and is remembered.
  useEffect(() => {
    try {
      if (fromUrl) {
        localStorage.setItem(ACTIVE_TAB_KEY, fromUrl);
        return;
      }
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      if (saved && tabs.some((t) => t.id === saved)) setActive(saved);
    } catch {
      // ignore
    }
    // Mount-only: this decides the *initial* tab, and re-running it later would
    // yank the tab out from under someone mid-visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <TabStrip label="Settings sections" activeKey={active}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-key={tab.id}
            aria-selected={active === tab.id}
            onClick={() => changeTab(tab.id)}
            className={
              '-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium transition ' +
              (active === tab.id
                ? 'text-accent'
                : 'minor-text-theme-colors hover:text-fg-strong')
            }
          >
            {tab.label}
          </button>
        ))}
      </TabStrip>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
