'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { formatSongMeta } from '@/lib/format';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { ConfirmModal } from '../../../ConfirmModal';
import { usePersistedBoolean } from '../../../usePersistedBoolean';
import { usePersistedStringSet } from '../../../usePersistedStringSet';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { useOfflineDownload } from '../../../offline/useOfflineDownload';
import { OfflineBadge } from '../../../offline/OfflineBadge';
import { usePlaylistPlayer } from '../../../player/PlaylistPlayer';
import { shuffledCopy } from '../../../player/queueOrder';
import { liveHref, practiceHref } from '@/lib/routes';
import {
  MinimizeToggle,
  setlistQueue,
  songCountLabel,
  type Setlist,
} from '../bandDetailShared';

/**
 * The Setlists tab: the band's active setlists (each expandable to reveal its
 * songs), a Create button, and a collapsible "Archived setlists" section.
 * Archiving is reversible and hides a setlist from the active list and from
 * add-to-setlist / event pickers. Owns per-setlist collapse + section state.
 */
export function BandSetlistsTab({
  bandId,
  setlists,
  onReload,
}: {
  bandId: string;
  setlists: Setlist[];
  onReload: () => Promise<void> | void;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const offline = useOfflineDownload();
  const player = usePlaylistPlayer();
  const [expandedSetlists, toggleSetlistExpanded] = usePersistedStringSet(
    `bandSetlistsExpanded:${bandId}`,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Setlist | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [setlistsMinimized, setSetlistsMinimized] = usePersistedBoolean(
    'bandSetlistsMinimized',
    false,
  );
  const [archivedMinimized, setArchivedMinimized] = usePersistedBoolean(
    'bandArchivedSetlistsMinimized',
    true,
  );

  const setArchived = async (sl: Setlist, archived: boolean) => {
    if (busyId) return;
    setBusyId(sl.id);
    try {
      await trackPending(async () => {
        const r = await fetch(
          `/api/bands/${bandId}/setlists/${sl.id}/archive`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived }),
          },
        );
        await ensureOk(r, [204]);
      });
      showToast(
        archived ? 'Setlist archived.' : 'Setlist unarchived.',
        'success',
      );
      await onReload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(
          `/api/bands/${bandId}/setlists/${deleteTarget.id}`,
          { method: 'DELETE' },
        );
        await ensureOk(r, [204]);
      });
      showToast('Setlist deleted.', 'success');
      setDeleteTarget(null);
      await onReload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const openDownload = (sl: Setlist) =>
    offline.openDownload({
      bandId,
      setlistId: sl.id,
      name: sl.name,
      songs: sl.songs,
    });

  const removeOffline = (sl: Setlist) =>
    offline.remove({ bandId, setlistId: sl.id, name: sl.name });

  const activeSetlists = setlists.filter((s) => !s.archived);
  const archivedSetlists = setlists.filter((s) => s.archived);

  // Hand the whole setlist to the global player, so it keeps playing as you
  // move around the app.
  const playAll = (sl: Setlist) => {
    const queue = setlistQueue(sl);
    if (queue.length === 0) {
      showToast('No songs with audio in this setlist.');
      return;
    }
    player.play(queue, 0);
  };

  // A one-off scramble, not the player's shuffle mode: a setlist's order is
  // deliberate, and a mode left on would keep reordering later plays of it.
  const shuffleAll = (sl: Setlist) => {
    const queue = setlistQueue(sl);
    if (queue.length === 0) {
      showToast('No songs with audio in this setlist.');
      return;
    }
    player.play(shuffledCopy(queue), 0);
  };

  // Same songs, but appended — whatever is playing keeps playing.
  const queueAll = (sl: Setlist) => {
    const tracks = setlistQueue(sl);
    if (tracks.length === 0) {
      showToast('No songs with audio in this setlist.');
      return;
    }
    player.enqueue(tracks);
    showToast(
      `Added ${tracks.length} song${tracks.length === 1 ? '' : 's'} to the queue.`,
      'success',
    );
  };

  const renderSetlist = (sl: Setlist) => {
    const collapsed = !expandedSetlists.has(sl.id);
    const busy = busyId === sl.id;
    const offlineRec = offline.records?.get(sl.id);
    const downloading = offline.busyId === sl.id;
    return (
      <li
        key={sl.id}
        className="rounded-lg border border-neutral-200 dark:border-neutral-800"
      >
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
          <button
            type="button"
            onClick={() => toggleSetlistExpanded(sl.id)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand setlist' : 'Minimize setlist'}
            title={collapsed ? 'Expand setlist' : 'Minimize setlist'}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
              <span className="truncate font-medium text-sm">{sl.name}</span>
            </span>
          </button>
          <span className="flex shrink-0 items-center gap-2 pr-1">
            {downloading ? (
              <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400">
                ↓ {Math.round(offline.progress * 100)}%
              </span>
            ) : offlineRec ? (
              <OfflineBadge
                downloadedAt={offlineRec.downloadedAt}
                stale={offline.isStale(sl)}
              />
            ) : null}
            <span className="text-xs minor-text-theme-colors">
              {songCountLabel(sl.songs)}
            </span>
            <ActionMenu label="Setlist actions" disabled={busy}>
              <ActionMenuItem onClick={() => playAll(sl)}>
                Play all songs
              </ActionMenuItem>
              <ActionMenuItem onClick={() => shuffleAll(sl)}>
                Shuffle all songs
              </ActionMenuItem>
              <ActionMenuItem onClick={() => queueAll(sl)}>
                Add songs to queue
              </ActionMenuItem>
              <ActionMenuItem
                onClick={() =>
                  router.push(`/bands/${bandId}/setlists/${sl.id}`)
                }
              >
                View setlist
              </ActionMenuItem>
              <ActionMenuItem
                onClick={() =>
                  router.push(`/bands/${bandId}/setlists/${sl.id}/edit`)
                }
              >
                Edit setlist
              </ActionMenuItem>
              <ActionMenuItem onClick={() => router.push(practiceHref(sl.id))}>
                Practice
              </ActionMenuItem>
              <ActionMenuItem onClick={() => router.push(liveHref(sl.id))}>
                Live
              </ActionMenuItem>
              {offlineRec ? (
                <>
                  <ActionMenuItem onClick={() => openDownload(sl)}>
                    {downloading ? 'Downloading…' : 'Update offline copy'}
                  </ActionMenuItem>
                  <ActionMenuItem onClick={() => void removeOffline(sl)}>
                    Remove offline copy
                  </ActionMenuItem>
                </>
              ) : (
                <ActionMenuItem onClick={() => openDownload(sl)}>
                  {downloading ? 'Downloading…' : 'Download for offline'}
                </ActionMenuItem>
              )}
              <ActionMenuItem onClick={() => setArchived(sl, !sl.archived)}>
                {sl.archived ? 'Unarchive setlist' : 'Archive setlist'}
              </ActionMenuItem>
              <ActionMenuItem destructive onClick={() => setDeleteTarget(sl)}>
                Delete setlist
              </ActionMenuItem>
            </ActionMenu>
          </span>
        </div>
        {!collapsed && sl.songs.length > 0 ? (
          <Link
            href={`/bands/${bandId}/setlists/${sl.id}`}
            className="flex min-w-0 flex-1 items-start flex-col justify-start gap-3 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <ul className="flex flex-col gap-0.5 px-4 py-3 text-sm minor-text-theme-colors">
              {sl.songs.map((s, i) => {
                const meta = s.conversationId
                  ? formatSongMeta(s.bpm, s.key)
                  : null;
                return (
                  <li
                    key={s.id}
                    className={
                      'truncate text-wrap ' +
                      (s.conversationId
                        ? ''
                        : 'text-xs py-1 font-semibold uppercase tracking-wide text-neutral-400')
                    }
                  >
                    <ol>
                      {i + 1} &nbsp; {s.name}
                      {meta && (
                        <span className="minor-text-theme-colors"> · {meta}</span>
                      )}
                    </ol>
                  </li>
                );
              })}
            </ul>
          </Link>
        ) : (
          !collapsed && (
            <p className="px-4 pb-3 text-sm text-neutral-600 dark:text-neutral-400">
              No songs in this setlist.
            </p>
          )
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <MinimizeToggle
            minimized={setlistsMinimized}
            onToggle={() => setSetlistsMinimized((v) => !v)}
            label="Setlists"
          >
            <h2 className="text-sm font-medium">Setlists</h2>
          </MinimizeToggle>
          <Link href={`/bands/${bandId}/setlists/new`} className="btn-outline">
            Create setlist
          </Link>
        </div>
        {!setlistsMinimized && (
          <>
            {setlists.length === 0 && (
              <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
                No setlists yet. Use “Create setlist” to build one.
              </p>
            )}
            {activeSetlists.length > 0 && (
              <ul className="flex flex-col gap-2">
                {activeSetlists.map(renderSetlist)}
              </ul>
            )}
            {setlists.length > 0 && activeSetlists.length === 0 && (
              <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
                No active setlists. Use “Create setlist” to build one.
              </p>
            )}
          </>
        )}
      </section>

      {archivedSetlists.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={archivedMinimized}
              onToggle={() => setArchivedMinimized((v) => !v)}
              label="Archived setlists"
            >
              <h2 className="text-sm font-medium minor-text-theme-colors">
                Archived setlists
              </h2>
            </MinimizeToggle>
            <span className="text-xs minor-text-theme-colors">
              <span aria-hidden="true">·</span> {archivedSetlists.length}
            </span>
          </div>
          {!archivedMinimized && (
            <ul className="flex flex-col gap-2">
              {archivedSetlists.map(renderSetlist)}
            </ul>
          )}
        </section>
      )}

      {offline.modal}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete setlist?"
        description={`This permanently deletes “${deleteTarget?.name ?? ''}” and removes it from any events. This can’t be undone.`}
        confirmLabel="Delete setlist"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
