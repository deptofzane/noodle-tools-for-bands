'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigate } from '../../../../useNavigate';
import { ensureOk } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../../../ActionMenu';
import { useShareLink } from '../../../../useShareLink';
import { EyeIcon, LinkIcon, PencilIcon } from '../../../../icons';
import { songHref } from '@/lib/routes';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';
import { usePlaylistPlayer } from '../../../../player/PlaylistPlayer';
import { albumQueue } from '../../bandDetailShared';
import type { AlbumTrack, AlbumWithTracks } from '@/lib/db/albums';

/**
 * One track on the album page.
 *
 * Carries the whole album so playing a track queues the rest from there, the
 * way the setlist and uploads surfaces do — a track is a starting point, not a
 * single song.
 *
 * The pin states are what this row exists to make visible:
 *
 *   - `pinned`     — name the version, so it's clear this isn't the default
 *   - `lost`       — say what went, and offer the one-tap resolution
 *   - `unplayable` — no audio anywhere; the row stays, greyed, so the album's
 *                    running order is still legible and editable
 */
export function AlbumTrackRow({
  album,
  track,
  index,
}: {
  album: AlbumWithTracks;
  track: AlbumTrack;
  /** Position in the album, 0-based — the track number shown is this + 1. */
  index: number;
}) {
  const router = useRouter();
  const go = useNavigate();
  const share = useShareLink();
  const player = usePlaylistPlayer();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [clearing, setClearing] = useState(false);

  const playable = track.state !== 'unplayable';

  /**
   * Where this track sits in the *queue*, which skips unplayable tracks — so
   * it can't be assumed to match the album position.
   */
  const playFromHere = () => {
    const queue = albumQueue(album);
    const at = album.tracks
      .filter((t) => t.state !== 'unplayable')
      .findIndex((t) => t.id === track.id);
    if (at >= 0) player.play(queue, at);
  };

  // Not named `useDefault`: anything starting with `use` is read as a custom
  // hook by react-hooks/rules-of-hooks, wherever it appears.
  const followCurrentVersion = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          `/api/bands/${album.bandId}/albums/${album.id}/tracks/${track.id}/pin`,
          { method: 'DELETE' },
        );
        await ensureOk(res);
      });
      showToast('Track now follows the song’s current version.', 'success');
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
        {index + 1}
      </span>

      <button
        type="button"
        onClick={playFromHere}
        disabled={!playable}
        aria-label={playable ? `Play ${track.name}` : undefined}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left disabled:opacity-60"
      >
        <span className="w-full truncate text-sm">{track.name}</span>

        {track.state === 'pinned' && (
          <span className="truncate text-xs minor-text-theme-colors">
            {track.pinnedLabel ?? track.pinnedFileName}
          </span>
        )}

        {track.state === 'lost' && (
          <span className="truncate text-xs text-amber-700 dark:text-amber-400">
            “{track.pinnedLabel ?? track.pinnedFileName}” was deleted — playing
            the song’s current version
          </span>
        )}

        {track.state === 'unplayable' && (
          <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {track.pinnedFileName
              ? `“${track.pinnedLabel ?? track.pinnedFileName}” was deleted, and this song has no other audio`
              : 'No audio yet'}
          </span>
        )}
      </button>

      {track.songLength != null && (
        <span className="shrink-0 text-xs tabular-nums minor-text-theme-colors">
          {formatDuration(track.songLength)}
        </span>
      )}

      <ActionMenu label={`Actions for ${track.name}`} disabled={clearing}>
        {track.state === 'lost' && (
          <ActionMenuItem onClick={() => void followCurrentVersion()}>
            Use the current version
          </ActionMenuItem>
        )}
        {/* Second, not first: "Use the current version" above repairs a
            broken row, and that has to stay the thing you reach for. */}
        <MenuSectionLabel>Song</MenuSectionLabel>
        <MenuIconRow
          items={[
            {
              key: 'view',
              icon: <EyeIcon size={18} />,
              label: `View ${track.name}`,
              title: 'View song',
              onClick: () => go(songHref(track.conversationId)),
            },
            {
              key: 'edit',
              icon: <PencilIcon size={18} />,
              label: `Edit ${track.name}`,
              title: 'Edit song',
              onClick: () => go(`/notes/${track.conversationId}/edit`),
            },
            {
              key: 'share',
              icon: <LinkIcon size={18} />,
              label: `Copy a link to ${track.name}`,
              title: 'Share song',
              onClick: () => void share(songHref(track.conversationId), 'Song'),
            },
          ]}
        />
      </ActionMenu>
    </li>
  );
}
