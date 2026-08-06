'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { formatDateLong, formatDateShort, formatTimeRange } from '@/lib/format';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
import { ConfirmModal } from '../../ConfirmModal';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { usePersistedBoolean } from '../../usePersistedBoolean';
import { usePersistedStringSet } from '../../usePersistedStringSet';
import { useOfflineDownload } from '../../offline/useOfflineDownload';
import { OfflineBadge } from '../../offline/OfflineBadge';
import { usePlaylistPlayer } from '../../player/PlaylistPlayer';
import {
  MinimizeToggle,
  setlistQueue,
  type Setlist,
  type Show,
} from './bandDetailShared';
import { MapLink } from '../../MapLink';
import { liveHref, practiceHref } from '@/lib/routes';
import { CollapsibleSection } from '@/app/CollapsibleSection';

/**
 * The Overview tab: upcoming Shows, Past shows, and (for non-owners) a Leave
 * button. Owns its own collapse/expand UI state; the parent supplies the data,
 * a reload callback, and the leave handler.
 */
export function BandOverviewTab({
  bandId,
  shows,
  setlists,
  onLeave,
  onReload,
}: {
  bandId: string;
  shows: Show[];
  /** All the band's setlists (with songs) — to offer offline download on an
   * event whose setlist is associated. */
  setlists: Setlist[];
  onLeave: () => void;
  onReload: () => Promise<void> | void;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const offline = useOfflineDownload();
  const player = usePlaylistPlayer();
  const [showsMinimized, setShowsMinimized] = usePersistedBoolean(
    'bandShowsMinimized',
    false,
  );
  const [pastShowsMinimized, setPastShowsMinimized] = usePersistedBoolean(
    'bandPastShowsMinimized',
    true,
  );
  const [expandedShows, toggleShowExpanded] = usePersistedStringSet(
    `bandEventsExpanded:${bandId}`,
  );
  const [deleteTarget, setDeleteTarget] = useState<Show | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/events/${deleteTarget.id}`, {
          method: 'DELETE',
        });
        await ensureOk(r, [204]);
      });
      showToast('Event deleted.', 'success');
      setDeleteTarget(null);
      await onReload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  // Append an event's setlist to the player queue — whatever is playing keeps
  // playing. `undefined` when the event points at a setlist we didn't load.
  const queueSetlist = (sl: Setlist | undefined) => {
    const tracks = sl ? setlistQueue(sl) : [];
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

  // Split shows by today's local date. Upcoming soonest-first; past kept
  // newest-first (the API order).
  const todayStr = (() => {
    const n = new Date();
    const p = (x: number) => x.toString().padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  })();
  const upcomingShows = shows
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pastShows = shows.filter((s) => s.date < todayStr);

  const renderShow = (show: Show) => {
    const expanded = expandedShows.has(show.id);
    // An event can offer offline download when it points at a setlist we have
    // (with at least one real song).
    const setlist = show.setlistId
      ? setlists.find((s) => s.id === show.setlistId)
      : undefined;
    const canDownload =
      !!setlist && setlist.songs.some((s) => s.conversationId);
    const offlineRec = setlist ? offline.records?.get(setlist.id) : undefined;
    const downloading = !!setlist && offline.busyId === setlist.id;
    const downloadTarget = setlist
      ? {
          bandId,
          setlistId: setlist.id,
          name: setlist.name,
          songs: setlist.songs,
        }
      : null;
    return (
      <li
        key={show.id}
        className="rounded-lg border border-neutral-200 dark:border-neutral-800"
      >
        <div className="flex items-center gap-1 pr-1">
          <button
            type="button"
            onClick={() => toggleShowExpanded(show.id)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="text-sm leading-none text-neutral-400"
              >
                {expanded ? '▾' : '▸'}
              </span>
              <span className="truncate font-medium">{show.title}</span>
            </span>
            <span className="shrink-0 text-xs text-neutral-500">
              {formatDateShort(show.date)}
            </span>
          </button>
          <ActionMenu label="Event actions">
            <ActionMenuItem
              onClick={() => router.push(`/calendar/events/${show.id}`)}
            >
              View event
            </ActionMenuItem>
            <ActionMenuItem
              onClick={() => router.push(`/calendar/events/${show.id}/edit`)}
            >
              Edit event
            </ActionMenuItem>
            {show.setlistId && (
              <>
                <ActionMenuItem
                  onClick={() =>
                    router.push(`/bands/${bandId}/setlists/${show.setlistId}`)
                  }
                >
                  View setlist
                </ActionMenuItem>
                <ActionMenuItem
                  onClick={() =>
                    router.push(
                      `/bands/${bandId}/setlists/${show.setlistId}/edit`,
                    )
                  }
                >
                  Edit setlist
                </ActionMenuItem>
                <ActionMenuItem onClick={() => queueSetlist(setlist)}>
                  Add setlist songs to queue
                </ActionMenuItem>
                <ActionMenuItem
                  onClick={() => router.push(practiceHref(show.setlistId!))}
                >
                  Practice
                </ActionMenuItem>
                <ActionMenuItem
                  onClick={() => router.push(liveHref(show.setlistId!))}
                >
                  Live
                </ActionMenuItem>
              </>
            )}
            {canDownload &&
              downloadTarget &&
              (offlineRec ? (
                <>
                  <ActionMenuItem
                    onClick={() => offline.openDownload(downloadTarget)}
                  >
                    {downloading ? 'Downloading…' : 'Update offline copy'}
                  </ActionMenuItem>
                  <ActionMenuItem
                    onClick={() =>
                      void offline.remove({
                        bandId,
                        setlistId: setlist!.id,
                        name: setlist!.name,
                      })
                    }
                  >
                    Remove offline copy
                  </ActionMenuItem>
                </>
              ) : (
                <ActionMenuItem
                  onClick={() => offline.openDownload(downloadTarget)}
                >
                  {downloading ? 'Downloading…' : 'Download for offline'}
                </ActionMenuItem>
              ))}
            <ActionMenuItem destructive onClick={() => setDeleteTarget(show)}>
              Delete event
            </ActionMenuItem>
          </ActionMenu>
        </div>
        {expanded && (
          <div className="flex flex-col gap-1 border-t border-neutral-200 px-4 py-3 text-sm md:px-3 dark:border-neutral-800">
            <div>
              <span className="font-medium">Date:</span>{' '}
              {formatDateLong(show.date)}
            </div>
            {show.venueName && (
              <div>
                <span className="font-medium">Venue:</span> {show.venueName}
              </div>
            )}
            {show.location && (
              <div>
                <span className="font-medium">Location:</span>{' '}
                <MapLink address={show.location} />
              </div>
            )}
            {show.time && (
              <div>
                <span className="font-medium">Time:</span>{' '}
                {formatTimeRange(show.time, show.endTime)}
              </div>
            )}
            {show.setlistId && (
              <div>
                <span className="font-medium">Setlist:</span>{' '}
                <Link
                  href={`/bands/${bandId}/setlists/${show.setlistId}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {show.setlistName ?? 'View setlist'}
                </Link>
                {downloading ? (
                  <span className="ml-2 text-xs tabular-nums text-blue-600 dark:text-blue-400">
                    ↓ {Math.round(offline.progress * 100)}%
                  </span>
                ) : offlineRec ? (
                  <span className="ml-2">
                    <OfflineBadge
                      downloadedAt={offlineRec.downloadedAt}
                      stale={setlist ? offline.isStale(setlist) : false}
                    />
                  </span>
                ) : null}
              </div>
            )}

            {show.details && (
              <section className="rounded-lg py-2 text-sm">
                <CollapsibleSection
                  title="Details"
                  persistKey="eventDetailsOpen"
                >
                  <p className="mt-2 ml-3 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                    {show.details}
                  </p>
                </CollapsibleSection>
              </section>
            )}

            {show.notes && (
              <section className="rounded-lg py-2 text-sm">
                <CollapsibleSection title="Notes" persistKey="eventNotesOpen">
                  <p className="mt-2 ml-3 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                    {show.notes}
                  </p>
                </CollapsibleSection>
              </section>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <MinimizeToggle
              minimized={showsMinimized}
              onToggle={() => setShowsMinimized((v) => !v)}
              label="Events"
            >
              <h2 className="text-sm font-medium">Events</h2>
            </MinimizeToggle>
          </span>
          <Link
            href={`/calendar/events/new?bandId=${bandId}`}
            className="btn-outline"
          >
            Add event
          </Link>
        </div>
        {!showsMinimized &&
          (upcomingShows.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {upcomingShows.map(renderShow)}
            </ul>
          ) : (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
              No upcoming events. Use “Add event” to schedule one.
            </p>
          ))}
      </section>

      {pastShows.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={pastShowsMinimized}
              onToggle={() => setPastShowsMinimized((v) => !v)}
              label="Past events"
            >
              <h2 className="text-sm font-medium text-neutral-500">
                Past events
              </h2>
            </MinimizeToggle>
          </div>
          {!pastShowsMinimized && (
            <ul className="flex flex-col gap-2">{pastShows.map(renderShow)}</ul>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={onLeave}
        className="shrink-0 rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 mt-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        Leave band
      </button>

      {offline.modal}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete event?"
        description={`This permanently deletes “${deleteTarget?.title ?? ''}”. This can’t be undone.`}
        confirmLabel="Delete event"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
