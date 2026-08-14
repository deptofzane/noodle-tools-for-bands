'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { ActionMenu, ActionMenuItem } from '../../../../ActionMenu';
import { ConfirmModal } from '../../../../ConfirmModal';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';
import { usePlaylistPlayer } from '../../../../player/PlaylistPlayer';
import { shuffledCopy } from '../../../../player/queueOrder';
import { albumQueue } from '../../bandDetailShared';
import type { AlbumWithTracks } from '@/lib/db/albums';

/**
 * The album's top actions: play it, shuffle it, or delete it.
 *
 * One kebab at every width rather than the buttons-plus-kebab split the
 * setlist page uses — an album has far fewer actions (no Practice, Live, or
 * offline download), so a row of buttons would be mostly empty space.
 */
export function AlbumActions({ album }: { album: AlbumWithTracks }) {
  const router = useRouter();
  const player = usePlaylistPlayer();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const queue = albumQueue(album);

  // A one-off scramble, not the player's shuffle mode — the same choice the
  // setlist surfaces make, for the same reason: a running order is deliberate.
  const shuffleAll = () => player.play(shuffledCopy(queue), 0);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          `/api/bands/${album.bandId}/albums/${album.id}`,
          { method: 'DELETE' },
        );
        await ensureOk(res, [204]);
      });
      // The songs are untouched — only their filing under this album is gone.
      showToast('Album deleted.', 'success');
      router.refresh();
      router.push(`/bands/${album.bandId}/audio?tab=songs`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ActionMenu label="Album actions" disabled={deleting}>
        {queue.length > 0 && (
          <>
            <ActionMenuItem onClick={() => player.play(queue, 0)}>
              Play all
            </ActionMenuItem>
            <ActionMenuItem onClick={shuffleAll}>Shuffle all</ActionMenuItem>
          </>
        )}
        <ActionMenuItem
          onClick={() =>
            router.push(`/bands/${album.bandId}/albums/${album.id}/edit`)
          }
        >
          Edit album
        </ActionMenuItem>
        <ActionMenuItem destructive onClick={() => setDeleteOpen(true)}>
          Delete album
        </ActionMenuItem>
      </ActionMenu>

      <ConfirmModal
        open={deleteOpen}
        title="Delete this album?"
        description={`“${album.name}” will be removed. The songs on it are not deleted — they stay in the band's audio.`}
        confirmLabel="Delete album"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
