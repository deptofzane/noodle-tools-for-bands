/**
 * The History page's categories. Kept out of the client component so the
 * server page can validate `?tab=` too — every export of a 'use client'
 * module becomes a client reference and can't be called during the server
 * render.
 */
export const HISTORY_TABS = ['conversations', 'polls', 'events'] as const;

export type HistoryTab = (typeof HISTORY_TABS)[number];

export const HISTORY_TAB_LABELS: Record<HistoryTab, string> = {
  conversations: 'Conversations',
  polls: 'Closed polls',
  events: 'Past events',
};

export const DEFAULT_HISTORY_TAB: HistoryTab = 'conversations';

export function isHistoryTab(v: string | null | undefined): v is HistoryTab {
  return HISTORY_TABS.includes(v as HistoryTab);
}
