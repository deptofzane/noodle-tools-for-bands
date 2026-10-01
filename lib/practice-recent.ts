import type {
  PickerEvent,
  PickerSetlist,
  PickerSong,
  PracticePicker,
} from './db/practice-picker';

/**
 * What was last practised on this device, for the picker's "Recent" pill:
 * the ten most recent songs, setlists or events, newest first. Per band —
 * the picker only ever shows the current band's — and only ids: names are
 * looked up fresh from the picker's lists, so a renamed song shows its new
 * name and a deleted or archived one quietly drops out.
 */
export type RecentKind = 'song' | 'setlist' | 'event';
export type RecentRef = { kind: RecentKind; id: string };
export type RecentItem =
  | { kind: 'song'; item: PickerSong }
  | { kind: 'setlist'; item: PickerSetlist }
  | { kind: 'event'; item: PickerEvent };

export const RECENT_MAX = 10;

/** `ref` to the front, any earlier copy of it removed, capped. */
export function pushRecent(list: RecentRef[], ref: RecentRef): RecentRef[] {
  return [
    ref,
    ...list.filter((r) => r.kind !== ref.kind || r.id !== ref.id),
  ].slice(0, RECENT_MAX);
}

/** The refs that still name something in the picker, with what they name. */
export function resolveRecent(
  list: RecentRef[],
  picker: PracticePicker,
): RecentItem[] {
  const out: RecentItem[] = [];
  for (const { kind, id } of list) {
    if (kind === 'song') {
      const item = picker.songs.find((s) => s.id === id);
      if (item) out.push({ kind, item });
    } else if (kind === 'setlist') {
      const item = picker.setlists.find((s) => s.id === id);
      if (item) out.push({ kind, item });
    } else {
      const item = picker.events.find((e) => e.id === id);
      if (item) out.push({ kind, item });
    }
  }
  return out;
}

const recentKey = (bandId: string) => `practiceRecent:${bandId}`;

export function loadRecent(bandId: string): RecentRef[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey(bandId)) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(
      (r): r is RecentRef =>
        (r?.kind === 'song' || r?.kind === 'setlist' || r?.kind === 'event') &&
        typeof r.id === 'string',
    );
  } catch {
    return [];
  }
}

export function recordRecent(bandId: string, ref: RecentRef): void {
  try {
    localStorage.setItem(
      recentKey(bandId),
      JSON.stringify(pushRecent(loadRecent(bandId), ref)),
    );
  } catch {
    // unavailable storage: nothing to remember with
  }
}

/**
 * The picker's pills. Recent the first time; whichever was last chosen after
 * that, on this device.
 */
export type PickerTab = 'recent' | 'songs' | 'setlists' | 'events';
const TAB_KEY = 'practicePickerTab';
const TABS: PickerTab[] = ['recent', 'songs', 'setlists', 'events'];

export function loadPickerTab(): PickerTab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return TABS.includes(t as PickerTab) ? (t as PickerTab) : 'recent';
  } catch {
    return 'recent';
  }
}

export function savePickerTab(tab: PickerTab): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // ignore
  }
}
