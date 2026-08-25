'use client';

import { useCallback } from 'react';
import { useToast } from '../ToastProvider';
import { usePlaylistPlayer, type PlaylistTrack } from './PlaylistPlayer';

/**
 * Append tracks to the queue and say what happened.
 *
 * Every surface offering this does the same three things — refuse an empty
 * list, enqueue, then report the count — and six of them were about to do it
 * separately. The count matters: appending is invisible when something is
 * already playing, so without the toast the button looks like it did nothing.
 *
 * `noun` names the thing that turned out to be empty ("this setlist"), which
 * is the only part that differs per caller.
 */
export function useEnqueueTracks(): (
  tracks: PlaylistTrack[],
  noun: string,
) => void {
  const player = usePlaylistPlayer();
  const showToast = useToast();
  return useCallback(
    (tracks, noun) => {
      if (tracks.length === 0) {
        showToast(`No songs with audio in ${noun}.`);
        return;
      }
      player.enqueue(tracks);
      showToast(
        `Added ${tracks.length} song${tracks.length === 1 ? '' : 's'} to the queue.`,
        'success',
      );
    },
    [player, showToast],
  );
}
