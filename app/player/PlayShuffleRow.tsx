'use client';

import { MenuIconRow } from '../ActionMenu';
import { PlayIcon, ShuffleIcon } from './icons';

/**
 * Play and shuffle as one row of an `ActionMenu`.
 *
 * They're the same action on the same songs in two orders, so a full-width
 * line each read as more difference than there is — and as the commonest
 * thing to do with a list, they sit at the top of every menu that offers them.
 *
 * The accessible names include *what* is being played: a list of setlists
 * otherwise gives a screen reader several identical "Play" buttons.
 */
export function PlayShuffleRow({
  label,
  onPlay,
  onShuffle,
}: {
  /** What's being played — a setlist, album, or day. Names both controls. */
  label: string;
  onPlay: () => void;
  onShuffle: () => void;
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
      ]}
    />
  );
}
