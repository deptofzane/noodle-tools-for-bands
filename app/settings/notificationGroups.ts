import type { NotificationKind } from '@/lib/db/notifications';
import { FEED_ONLY_KINDS } from '@/lib/notification-kinds';

/**
 * How the notification settings are presented.
 *
 * Seventeen independent switches in one flat list is a wall, so they're
 * grouped the way the app itself is organised — someone hunting for a setting
 * looks where the feature lives. Kept out of the component (and free of any
 * server import) so the grouping and the master-switch arithmetic can be
 * tested without rendering anything.
 *
 * A *row* is not always a kind. Two pairs are near-duplicates that nobody
 * would sensibly split — a pin and its removal, a poll closing by hand or by
 * everyone having voted — so those render as one switch writing both kinds.
 */
export interface PrefRow {
  /** Every kind this row controls. Usually one. */
  kinds: NotificationKind[];
  label: string;
  description: string;
}

export interface PrefGroup {
  /** Stable id — persisted as the open/closed marker, so don't rename. */
  id: string;
  label: string;
  rows: PrefRow[];
}

export const PREF_GROUPS: PrefGroup[] = [
  {
    id: 'audio',
    label: 'Songs & audio',
    rows: [
      {
        kinds: ['song-created'],
        label: 'New songs',
        description: 'When a song is created in one of your bands.',
      },
      {
        kinds: ['song-updated'],
        label: 'Song updates',
        description: 'When a song is renamed, moved, or archived.',
      },
      {
        kinds: ['song-comment'],
        label: 'Song comments',
        description: 'When someone comments on a song you have access to.',
      },
      {
        kinds: ['audio-added'],
        label: 'New audio',
        description: 'When audio is added to one of your bands.',
      },
      {
        kinds: ['album-created'],
        label: 'New albums',
        description: 'When an album is created in one of your bands.',
      },
      {
        kinds: ['setlist-created'],
        label: 'New setlists',
        description: 'When a setlist is created in one of your bands.',
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    rows: [
      {
        kinds: ['event-added'],
        label: 'New events',
        description: 'When an event is added to one of your bands.',
      },
      {
        kinds: ['event-updated'],
        label: 'Event updates',
        description: 'When an event’s details are edited.',
      },
    ],
  },
  {
    id: 'polls',
    label: 'Polls',
    rows: [
      {
        kinds: ['poll-created'],
        label: 'Polls',
        description: 'When a new poll is started in one of your bands.',
      },
      {
        kinds: ['poll-updated'],
        label: 'Poll updates',
        description: 'When a poll is edited (and re-opened).',
      },
      {
        kinds: ['poll-closed', 'poll-auto-closed'],
        label: 'Closed polls',
        description:
          'When a poll closes — by hand, or automatically once everyone has voted.',
      },
      {
        kinds: ['poll-cancelled'],
        label: 'Cancelled polls',
        description: 'When a poll in one of your bands is cancelled.',
      },
    ],
  },
  {
    id: 'chat',
    label: 'Chat & notes',
    rows: [
      {
        kinds: ['chat-message'],
        label: 'Band chat',
        description: 'New messages in a band’s chat.',
      },
      {
        kinds: ['note-pinned', 'note-unpinned'],
        label: 'Pinned notes',
        description:
          'When someone pins a note to the top of your band’s shared notes, or takes one back down.',
      },
    ],
  },
  {
    id: 'band',
    label: 'Band',
    rows: [
      {
        kinds: ['band-updated'],
        label: 'Band updates',
        description: 'When a band’s members change.',
      },
    ],
  },
];

/** Every kind a row covers, flattened. */
export const groupKinds = (g: PrefGroup): NotificationKind[] =>
  g.rows.flatMap((r) => r.kinds);

export const ALL_PREF_KINDS: NotificationKind[] =
  PREF_GROUPS.flatMap(groupKinds);

/**
 * A row can push only if any of its kinds can. The pin row is the case: both
 * its kinds are feed-only, so its Push switch controls nothing and is drawn
 * disabled rather than writing a preference no code reads.
 */
export const rowCanPush = (row: PrefRow): boolean =>
  row.kinds.some((k) => !FEED_ONLY_KINDS.has(k));

/** Kinds in this group that push at all — what a Push master may touch. */
export const pushableKinds = (g: PrefGroup): NotificationKind[] =>
  groupKinds(g).filter((k) => !FEED_ONLY_KINDS.has(k));

export type MasterState = 'on' | 'off' | 'mixed';

/**
 * What a master switch reads, given the rows it governs.
 *
 * `mixed` only ever means "some, not all" — it is never a starting state a
 * click produces, because a click always lands on a uniform result.
 */
export function masterState(
  kinds: NotificationKind[],
  isOn: (k: NotificationKind) => boolean,
): MasterState {
  if (kinds.length === 0) return 'off';
  const on = kinds.filter(isOn).length;
  if (on === 0) return 'off';
  if (on === kinds.length) return 'on';
  return 'mixed';
}

/**
 * What a click on a master switch does: off only when everything below is
 * already off, otherwise on.
 *
 * Written as its own function because the asymmetry is the point and it is
 * easy to get backwards. A half-on category collapses to off — reaching for
 * a master is nearly always about silencing something, and "turn the rest on
 * too" is not what a half-lit switch suggests.
 */
export function masterClickTurnsOn(state: MasterState): boolean {
  return state === 'off';
}
