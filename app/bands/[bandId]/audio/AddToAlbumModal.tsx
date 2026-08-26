'use client';

import { useEffect, useState } from 'react';
import { ensureOk } from '@/lib/api';
import { Modal } from '../../../Modal';
import { LoadingBlock, Spinner } from '../../../Spinner';
import { useToast } from '../../../ToastProvider';
import { useTrackPending } from '../../../PendingActionProvider';
import type { Conversation } from '../bandDetailShared';
import type { AlbumWithTracks } from '@/lib/db/albums';

/**
 * "Add to album": append a song to the end of one or more albums.
 *
 * Appends rather than reconciles, which is the difference from the setlist
 * version. A song may sit on an album more than once, so an already-present
 * album isn't checked and un-checking can't mean "remove" — the checkbox would
 * be lying about what it does. Removing a track is the album editor's job,
 * where you can see which of the copies you mean.
 *
 * New tracks are unpinned, so they follow the song's current version; pinning a
 * particular take is a deliberate act done in the editor.
 */
export function AddToAlbumModal({
  bandId,
  target,
  onClose,
  onAdded,
}: {
  bandId: string;
  target: Conversation;
  onClose: () => void;
  onAdded: () => void;
}) {
  const showToast = useToast();
  const trackPending = useTrackPending();
  const [albums, setAlbums] = useState<AlbumWithTracks[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bands/${bandId}/albums?tracks=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { albums: AlbumWithTracks[] }) => {
        if (!cancelled) setAlbums(d.albums);
      })
      .catch(() => {
        if (!cancelled) setAlbums([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    if (selected.size === 0 || !albums || busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        // One PATCH per album: each replaces that album's whole running order,
        // so they're built from the copy fetched above plus this song.
        for (const album of albums.filter((a) => selected.has(a.id))) {
          const tracks = [
            ...album.tracks.map((t) => ({
              conversationId: t.conversationId,
              // A lost pin has no id to resend; it becomes unpinned, matching
              // what the editor does when you save an album holding one.
              audioVersionId: t.state === 'pinned' ? t.audioVersionId : null,
            })),
            { conversationId: target.id, audioVersionId: null },
          ];
          const res = await fetch(`/api/bands/${bandId}/albums/${album.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks }),
          });
          await ensureOk(res);
        }
      });
      showToast(
        selected.size === 1
          ? 'Added to the album.'
          : `Added to ${selected.size} albums.`,
        'success',
      );
      onAdded();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={busy} labelledBy="add-album-title" size="sm">
      <h2 id="add-album-title" className="text-base font-semibold">
        Add to album
      </h2>
      <p className="mt-1 truncate text-sm text-fg-muted">
        {target.audioFileName ?? 'Untitled audio'}
      </p>

      {!albums ? (
        <LoadingBlock label="Loading albums" className="py-8" />
      ) : albums.length === 0 ? (
        <p className="mt-4 rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          No albums yet. Create one first.
        </p>
      ) : (
        <ul className="mt-4 flex max-h-64 flex-col gap-1 overflow-auto">
          {albums.map((a) => {
            const already = a.tracks.filter(
              (t) => t.conversationId === target.id,
            ).length;
            return (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                    disabled={busy}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {a.name}
                  </span>
                  {/* Said plainly rather than by pre-checking the box: adding
                      again is allowed, and the user should know they're about
                      to end up with two copies. */}
                  {already > 0 && (
                    <span className="shrink-0 text-xs minor-text-theme-colors">
                      already on it{already > 1 ? ` ×${already}` : ''}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="btn-outline"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy || selected.size === 0}
          className="btn-primary inline-flex items-center gap-2"
        >
          {busy && (
            <span aria-hidden="true" className="flex">
              <Spinner size="xs" tone="onFilled" />
            </span>
          )}
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </Modal>
  );
}
