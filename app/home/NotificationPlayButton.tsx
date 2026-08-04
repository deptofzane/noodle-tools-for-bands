'use client';

import { useState } from 'react';
import { ensureOk } from '@/lib/api';
import type { Conversation } from '@/app/bands/[bandId]/bandDetailShared';
import { useToast } from '../ToastProvider';
import { usePlaylistPlayer } from '../player/PlaylistPlayer';
import { Spinner } from '../Spinner';
import {
  batchCount,
  tracksForNotification,
  type UploadNotification,
} from './notificationTracks';

/**
 * Plays the audio an "added audio" notification announced, without making the
 * user go find it first.
 *
 * The songs are resolved on click rather than up front: the notification row
 * knows only its band, and pre-fetching every band in the feed to light up
 * buttons nobody may press would cost more than the feature saves.
 */
export function NotificationPlayButton({
  notification,
  bandId,
}: {
  notification: UploadNotification;
  bandId: string;
}) {
  const player = usePlaylistPlayer();
  const showToast = useToast();
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState<string[] | null>(null);

  // Whether the queue *this* button started is still the one loaded. Checking
  // the current track against the ids we queued matters as much as
  // remembering that we queued them: playing something else elsewhere should
  // put this button back to "play", not leave it claiming to control the
  // player.
  const isMine =
    queued !== null &&
    player.track !== null &&
    queued.includes(player.track.id);
  const isPlaying = isMine && player.isPlaying;

  const count = notification.subjectId
    ? 1
    : batchCount(notification.subjectLabel);
  const noun = count === 1 ? 'the new upload' : `the ${count} new uploads`;

  const handleClick = async () => {
    // Already ours — this is a transport control, not a fresh start. Without
    // this a second press would refetch and restart from the top.
    if (isMine) {
      player.toggle();
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bands/${bandId}/conversations`, {
        cache: 'no-store',
      });
      await ensureOk(res);
      const { conversations } = (await res.json()) as {
        conversations: Conversation[];
      };
      const tracks = tracksForNotification(notification, conversations);
      if (tracks.length === 0) {
        // The notification outlives the songs it announced.
        showToast(
          count === 1
            ? 'That audio is no longer available.'
            : 'Those uploads are no longer available.',
        );
        return;
      }
      setQueued(tracks.map((t) => t.id));
      player.play(tracks, 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={isPlaying ? `Pause ${noun}` : `Play ${noun}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      {loading ? (
        <Spinner />
      ) : isPlaying ? (
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
