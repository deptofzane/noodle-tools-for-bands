'use client';

import { MenuIconRow } from '../ActionMenu';
import { AddToQueueIcon } from '../icons';
import { PlayIcon, ShuffleIcon } from './icons';

/**
 * Play and shuffle as one row of an `ActionMenu`.
 *
 * They're the same action on the same songs in two orders, so a full-width
 * line each read as more difference than there is — and as the commonest
 * thing to do with a list, they sit at the top of every menu that offers them.
 *
 * `onQueue` adds a third column where the surface has something to append to.
 * It's optional because most menus offering play and shuffle have no queue
 * action of their own, and a column that did nothing would be worse than one
 * that isn't there.
 *
 * The accessible names include *what* is being played: a list of setlists
 * otherwise gives a screen reader several identical "Play" buttons.
 */
export function PlayShuffleRow({
  label,
  onPlay,
  onShuffle,
  onQueue,
}: {
  /** What's being played — a setlist, album, or day. Names every control. */
  label: string;
  onPlay: () => void;
  onShuffle: () => void;
  /** Append rather than replace. Omitted where there's nothing to append. */
  onQueue?: () => void;
}) {
  return (
    <MenuIconRow
      items={[
        {
          key: 'play',
          icon: <PlayIcon size={18} />,
          label: `Play all songs in ${label}`,
          title: 'Play all songs',
          onClick: onPlay,
        },
        {
          key: 'shuffle',
          icon: <ShuffleIcon size={18} />,
          label: `Shuffle all songs in ${label}`,
          title: 'Shuffle all songs',
          onClick: onShuffle,
        },
        // Last, so the two that replace the queue stay together and the one
        // that appends to it reads as the odd one out — which it is.
        ...(onQueue
          ? [
              {
                key: 'queue',
                icon: <AddToQueueIcon size={18} />,
                label: `Add songs in ${label} to the queue`,
                title: 'Add songs to queue',
                onClick: onQueue,
              },
            ]
          : []),
      ]}
    />
  );
}
