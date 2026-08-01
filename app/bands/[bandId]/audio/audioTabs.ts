/**
 * The Audio page's tabs. Kept out of the client component so the server page
 * can validate `?tab=` (every export of a 'use client' module becomes a client
 * reference and can't be called during the server render).
 */
export const AUDIO_TABS = ['queue', 'songs', 'setlists', 'uploads'] as const;

export type AudioTab = (typeof AUDIO_TABS)[number];

export const TAB_LABELS: Record<AudioTab, string> = {
  queue: 'Song queue',
  songs: 'Songs',
  setlists: 'Setlists',
  uploads: 'Uploads',
};

/** The tab shown when there's no `?tab=` and nothing remembered. */
export const DEFAULT_AUDIO_TAB: AudioTab = 'queue';

export const AUDIO_TAB_STORAGE_KEY = 'audioTab';

export function isAudioTab(v: string | null | undefined): v is AudioTab {
  return AUDIO_TABS.includes(v as AudioTab);
}
