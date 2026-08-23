/**
 * The band page's tabs. Kept out of the client component so the server page
 * can validate `?tab=` too — every export of a 'use client' module becomes a
 * client reference and can't be called during the server render.
 */
export const BAND_TABS = [
  'todos',
  'events',
  'venues',
  'notes',
  'polls',
] as const;

export type BandTab = (typeof BAND_TABS)[number];

/**
 * Where the last-used tab is remembered. Read on a paramless visit to
 * `/bands/[id]`, so anything that wants to send someone to a particular tab
 * has to set it too.
 *
 * A stored 'chat' from before it became its own page fails `isBandTab` and is
 * ignored, so those visits just open the default tab.
 */
export const BAND_ACTIVE_TAB_KEY = 'bandActiveTab';

/** The tab a bare `/bands/[id]` opens on. */
export const DEFAULT_BAND_TAB: BandTab = 'events';

export function isBandTab(v: string | null | undefined): v is BandTab {
  return BAND_TABS.includes(v as BandTab);
}
