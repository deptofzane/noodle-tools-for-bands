'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { Modal } from '../../../Modal';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { useOfflineDownload } from '../../../offline/useOfflineDownload';
import type { OfflineSong } from '../../../offline/offlineSetlists';
import { LoadingBlock } from '../../../Spinner';
import {
  usePlaylistPlayer,
  type PlaylistTrack,
} from '../../../player/PlaylistPlayer';
import { shuffledCopy } from '../../../player/queueOrder';
import { liveHref, practiceHref } from '@/lib/routes';

/** The event's current fields, resent on PATCH (which replaces all of them). */
export interface EventSetlistPatchFields {
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
  details: string | null;
  venueId: string | null;
}

/**
 * Actions for the setlist attached to an event, in a kebab menu: jump to
 * Practice or Live, edit the setlist, or swap in a different one. "Choose
 * different setlist" opens a picker and PATCHes the event's association;
 * everything else is navigation. Rendered only for band members.
 */
export function EventSetlistActions({
  bandId,
  eventId,
  setlistId,
  setlistName,
  songs,
  queue,
  fields,
}: {
  bandId: string;
  eventId: string;
  setlistId: string;
  setlistName: string;
  /** The setlist's items, for offline download (markers are ignored). */
  songs: OfflineSong[];
  /**
   * The same setlist as a player queue. Built by the page rather than here so
   * it uses the one `setlistQueue` every other surface does; shorter than
   * `songs`, since markers and songs without audio drop out.
   */
  queue: PlaylistTrack[];
  fields: EventSetlistPatchFields;
}) {
  const router = useRouter();
  const player = usePlaylistPlayer();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const offline = useOfflineDownload();

  const offlineRec = offline.records?.get(setlistId);
  const downloading = offline.busyId === setlistId;
  const downloadTarget = { bandId, setlistId, name: setlistName, songs };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [setlists, setSetlists] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [busy, setBusy] = useState(false);

  const openPicker = async () => {
    setPickerOpen(true);
    if (setlists !== null) return;
    try {
      const r = await fetch(`/api/bands/${bandId}/setlists`, {
        cache: 'no-store',
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as {
        setlists: { id: string; name: string }[];
      };
      setSetlists(d.setlists.map((s) => ({ id: s.id, name: s.name })));
    } catch {
      setSetlists([]);
    }
  };

  const choose = async (newSetlistId: string) => {
    if (busy || newSetlistId === setlistId) {
      setPickerOpen(false);
      return;
    }
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, setlistId: newSetlistId }),
        });
        await ensureOk(r);
      });
      setPickerOpen(false);
      showToast(
        newSetlistId ? 'Setlist updated.' : 'Setlist removed.',
        'success',
      );
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="self-end">
      <ActionMenu label="Setlist actions" disabled={busy}>
        {queue.length > 0 && (
          <>
            <ActionMenuItem onClick={() => player.play(queue, 0)}>
              Play all
            </ActionMenuItem>
            {/* One-off scramble, not the player's shuffle mode — a setlist's
                order is deliberate. Same call the other setlist surfaces make. */}
            <ActionMenuItem
              onClick={() => player.play(shuffledCopy(queue), 0)}
            >
              Shuffle all
            </ActionMenuItem>
          </>
        )}
        <ActionMenuItem onClick={() => router.push(practiceHref(setlistId))}>
          Practice
        </ActionMenuItem>
        <ActionMenuItem onClick={() => router.push(liveHref(setlistId))}>
          Live
        </ActionMenuItem>
        <ActionMenuItem
          onClick={() => router.push(`/bands/${bandId}/setlists/${setlistId}`)}
        >
          View setlist
        </ActionMenuItem>
        <ActionMenuItem
          onClick={() =>
            router.push(`/bands/${bandId}/setlists/${setlistId}/edit`)
          }
        >
          Edit setlist
        </ActionMenuItem>
        {offlineRec ? (
          <>
            <ActionMenuItem
              onClick={() => offline.openDownload(downloadTarget)}
            >
              {downloading ? 'Downloading…' : 'Update offline copy'}
            </ActionMenuItem>
            <ActionMenuItem
              onClick={() =>
                void offline.remove({ bandId, setlistId, name: setlistName })
              }
            >
              Remove offline copy
            </ActionMenuItem>
          </>
        ) : (
          <ActionMenuItem onClick={() => offline.openDownload(downloadTarget)}>
            {downloading ? 'Downloading…' : 'Download for offline'}
          </ActionMenuItem>
        )}
        <ActionMenuItem onClick={() => void openPicker()}>
          Choose different setlist
        </ActionMenuItem>
      </ActionMenu>

      {pickerOpen && (
        <Modal
          onClose={() => !busy && setPickerOpen(false)}
          busy={busy}
          labelledBy="event-setlist-picker-title"
          size="sm"
        >
          <h2
            id="event-setlist-picker-title"
            className="text-base font-semibold"
          >
            Choose a setlist
          </h2>

          {setlists === null ? (
            <LoadingBlock className="mt-3 py-6" label="Loading setlists" />
          ) : (
            <ul className="mt-3 flex max-h-[50vh] flex-col overflow-y-auto">
              <li>
                <button
                  type="button"
                  onClick={() => void choose('')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
                    {setlistId === '' ? '✓' : ''}
                  </span>
                  <span className="minor-text-theme-colors">No setlist</span>
                </button>
              </li>
              {setlists.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void choose(s.id)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
                      {s.id === setlistId ? '✓' : ''}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </button>
                </li>
              ))}
              {setlists.length === 0 && (
                <li className="px-3 py-6 text-center text-sm minor-text-theme-colors">
                  This band has no other setlists.
                </li>
              )}
            </ul>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              disabled={busy}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {offline.modal}
    </div>
  );
}
