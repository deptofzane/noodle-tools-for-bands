'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigate } from '../../../../useNavigate';
import { ensureOk } from '@/lib/api';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
} from '../../../../ActionMenu';
import { PlayShuffleRow } from '../../../../player/PlayShuffleRow';
import { useEnqueueTracks } from '../../../../player/useEnqueueTracks';
import { useShareLink } from '../../../../useShareLink';
import { LinkIcon, PencilIcon } from '../../../../icons';
import { albumHref } from '@/lib/routes';
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
  const go = useNavigate();
  const player = usePlaylistPlayer();
  const enqueue = useEnqueueTracks();
  const share = useShareLink();
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
      // `replace`: Back must not return to an editor for something now deleted.
      router.replace(`/bands/${album.bandId}/audio?tab=songs`);
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
        {/* No View: this *is* the album's page. Edit and share are the two
            things left that act on it as a whole. */}
        <MenuIconRow
          items={[
            {
              key: 'edit',
              icon: <PencilIcon size={18} />,
              label: `Edit ${album.name}`,
              title: 'Edit album',
              onClick: () =>
                go(`/bands/${album.bandId}/albums/${album.id}/edit`),
            },
            {
              key: 'share',
              icon: <LinkIcon size={18} />,
              label: `Copy a link to ${album.name}`,
              title: 'Share album',
              onClick: () =>
                void share(albumHref(album.bandId, album.id), 'Album'),
            },
          ]}
        />
        {queue.length > 0 && (
          <PlayShuffleRow
            label={album.name}
            onPlay={() => player.play(queue, 0)}
            onShuffle={shuffleAll}
            onQueue={() => enqueue(queue, 'this album')}
          />
        )}
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
