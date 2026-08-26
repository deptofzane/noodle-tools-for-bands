'use client';

import { useState } from 'react';
import { ensureOk } from '@/lib/api';
import {
  setlistQueue,
  type Conversation,
  type Setlist,
} from '@/app/bands/[bandId]/bandDetailShared';
import { uploadsQueue } from '@/app/bands/[bandId]/audio/uploadDays';
import type { BandUpload } from '@/lib/db/song-files';
import { useToast } from '../ToastProvider';
import { usePlaylistPlayer } from '../player/PlaylistPlayer';
import { Spinner } from '../Spinner';
import {
  isSetlistNotification,
  tracksForNotification,
  type PlayableNotification,
} from './notificationTracks';
import type { PlaylistTrack } from '../player/PlaylistPlayer';

/** The one song a named upload notification is about. */
async function songTracks(
  bandId: string,
  notification: PlayableNotification,
): Promise<PlaylistTrack[]> {
  const res = await fetch(`/api/bands/${bandId}/conversations`, {
    cache: 'no-store',
  });
  await ensureOk(res);
  const { conversations } = (await res.json()) as {
    conversations: Conversation[];
  };
  return tracksForNotification(notification, conversations);
}

/**
 * Everything the band uploaded on a rollup's day — first uploads and new
 * versions alike, which is what the rollup counted. Grouping happens here
 * rather than server-side because upload days are the viewer's local days.
 */
async function dayTracks(
  bandId: string,
  day: string,
): Promise<PlaylistTrack[]> {
  const res = await fetch(`/api/bands/${bandId}/uploads`, {
    cache: 'no-store',
  });
  await ensureOk(res);
  const { uploads } = (await res.json()) as { uploads: BandUpload[] };
  return uploadsQueue(uploads, day);
}

/**
 * The named setlist, as a queue. A setlist deleted since the notification
 * 404s, which resolves to nothing to play rather than an error.
 */
async function setlistTracks(
  bandId: string,
  setlistId: string,
): Promise<PlaylistTrack[]> {
  const res = await fetch(`/api/bands/${bandId}/setlists/${setlistId}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return [];
  await ensureOk(res);
  const { setlist } = (await res.json()) as { setlist: Setlist };
  return setlistQueue({ name: setlist.name, songs: setlist.songs });
}

/**
 * Plays whatever a notification announced — the day's uploads, or a new
 * setlist — without making the user go find it first.
 *
 * The songs are resolved on click rather than up front: the notification row
 * knows only its band, and pre-fetching every band in the feed to light up
 * buttons nobody may press would cost more than the feature saves.
 */
export function NotificationPlayButton({
  notification,
  bandId,
}: {
  notification: PlayableNotification;
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

  const isSetlist = isSetlistNotification(notification);
  // A rollup's count includes audio versions, which aren't playable on their
  // own, so it can't be promised in the label — say what it is instead.
  const noun = isSetlist
    ? `the setlist ${notification.subjectLabel ?? ''}`.trim()
    : notification.subjectId
      ? 'the new upload'
      : "the day's new uploads";

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
      const tracks = isSetlist
        ? await setlistTracks(bandId, notification.subjectId!)
        : notification.subjectId
          ? await songTracks(bandId, notification)
          : await dayTracks(bandId, notification.day ?? '');
      if (tracks.length === 0) {
        // The notification outlives what it announced — a deleted song, a
        // rollup that counted only new versions, an empty setlist.
        showToast(
          isSetlist
            ? 'Nothing to play in that setlist yet.'
            : notification.subjectId
              ? 'That audio is no longer available.'
              : 'No new songs to play from that day.',
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
      className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full border border-line-strong text-fg-body hover:bg-surface-hover disabled:opacity-50"
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
