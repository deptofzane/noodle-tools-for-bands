'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '../../../useNavigate';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { Spinner } from '../../../Spinner';
import { usePersistedBoolean } from '../../../usePersistedBoolean';
import { MinimizeToggle, type Conversation } from '../bandDetailShared';
import { SongRow } from './SongRow';
import { BandAlbumList } from './BandAlbumList';
import { AddToAlbumModal } from './AddToAlbumModal';
import type { AlbumWithTracks } from '@/lib/db/albums';

/**
 * The Audio page's body: a search box that filters both the active Audio list
 * and the Archived Audio list (each within its own collapsible container). Owns
 * its search and minimize UI state; the parent supplies the songs and the row
 * action handlers, and owns the "Add audio" source modal.
 */
export function BandAudioList({
  bandId,
  conversations,
  bandName,
  canUseDrive,
  importProgress,
  audioBusy,
  rowsDisabled,
  onOpenChooser,
  onCreateSong,
  onAddToSetlist,
  onEditSong,
  onViewSong,
  onToggleArchive,
  onDelete,
}: {
  bandId: string;
  conversations: Conversation[] | null;
  bandName: string | null;
  canUseDrive: boolean;
  importProgress: { current: number; total: number } | null;
  audioBusy: boolean;
  rowsDisabled: boolean;
  onOpenChooser: () => void;
  onCreateSong: () => void;
  onAddToSetlist: (c: Conversation) => void;
  onEditSong: (c: Conversation) => void;
  onViewSong: (c: Conversation) => void;
  onToggleArchive: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  const [search, setSearch] = useState('');
  const [audioMinimized, setAudioMinimized] = useState(false);
  const [archivedMinimized, setArchivedMinimized] = useState(true);
  const go = useNavigate();

  /**
   * Songs or albums. Persisted, so someone who organises by album stays there.
   */
  const [albumView, setAlbumView] = usePersistedBoolean(
    'audioSongsAlbumView',
    false,
  );

  /**
   * Albums, fetched only once album view is first opened.
   *
   * The Songs tab already ships every song; pulling every album and its tracks
   * as well would be paid for by everyone, including the majority who never
   * switch. Kept after the first load so toggling back and forth is instant.
   */
  // Song whose "Add to album" modal is open.
  const [albumTarget, setAlbumTarget] = useState<Conversation | null>(null);
  const [albums, setAlbums] = useState<AlbumWithTracks[] | null>(null);
  useEffect(() => {
    if (!albumView || albums) return;
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
  }, [albumView, albums, bandId]);

  const activeSongs = conversations?.filter((c) => !c.archived) ?? null;
  const archivedSongs = conversations?.filter((c) => c.archived) ?? [];

  const q = search.trim().toLowerCase();
  const matches = (c: Conversation) =>
    !q || (c.audioFileName ?? 'Untitled audio').toLowerCase().includes(q);
  const visibleActive = activeSongs ? activeSongs.filter(matches) : null;
  const visibleArchived = archivedSongs.filter(matches);

  const row = (c: Conversation) => (
    <SongRow
      key={c.id}
      c={c}
      bandName={bandName}
      disabled={rowsDisabled}
      onAddToSetlist={onAddToSetlist}
      onAddToAlbum={setAlbumTarget}
      onEdit={onEditSong}
      onView={onViewSong}
      onToggleArchive={onToggleArchive}
      onDelete={onDelete}
    />
  );

  return (
    <>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={albumView ? 'Search albums and songs…' : 'Search audio…'}
        aria-label={albumView ? 'Search albums and songs' : 'Search audio'}
        className="w-full rounded-md border border-line-strong px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:bg-neutral-900 dark:placeholder:minor-text-theme-colors"
      />
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <MinimizeToggle
              minimized={audioMinimized}
              onToggle={() => setAudioMinimized((v) => !v)}
              label={albumView ? 'Albums' : 'Audio'}
            >
              <h2 className="text-sm font-medium">
                {albumView ? 'Albums' : 'Audio'}
              </h2>
            </MinimizeToggle>
            {/* Progress sits beside the heading now that the actions are in a
                menu: a disabled kebab can't be opened to read a busy label, so
                this is the only place the work is visible. `role="status"` is
                on the wrapper so the count itself is what gets announced. */}
            {importProgress || audioBusy ? (
              <span role="status" className="flex min-w-0 items-center gap-1.5">
                {/* Decorative — the text beside it already says what's
                    happening, so the spinner stays out of the accessibility
                    tree rather than announcing a second time. */}
                <span aria-hidden="true" className="flex">
                  <Spinner size="xs" />
                </span>
                <span className="truncate text-xs minor-text-band-theme-colors">
                  {importProgress
                    ? `↑ ${importProgress.current} of ${importProgress.total}…`
                    : 'Adding…'}
                </span>
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {/* Songs or albums. A two-state segmented control rather than a
                checkbox: both destinations are named, so neither reads as the
                "off" position of the other. */}
            <span
              role="group"
              aria-label="View"
              className="flex items-center rounded-md border border-line-strong p-0.5 text-xs"
            >
              {([false, true] as const).map((wantAlbums) => (
                <button
                  key={String(wantAlbums)}
                  type="button"
                  onClick={() => setAlbumView(wantAlbums)}
                  aria-pressed={albumView === wantAlbums}
                  className={
                    'rounded px-2 py-1 ' +
                    (albumView === wantAlbums
                      ? 'bg-fill-2 font-medium text-fg'
                      : 'minor-text-theme-colors hover:text-fg-strong')
                  }
                >
                  {wantAlbums ? 'Albums' : 'Songs'}
                </button>
              ))}
            </span>
            <ActionMenu
              label="Audio actions"
              disabled={audioBusy || importProgress !== null}
            >
              {albumView ? (
                <ActionMenuItem
                  onClick={() => go(`/bands/${bandId}/albums/new`)}
                >
                  Create album
                </ActionMenuItem>
              ) : (
                <>
                  <ActionMenuItem onClick={onCreateSong}>
                    Create song without audio
                  </ActionMenuItem>
                  <ActionMenuItem onClick={onOpenChooser}>
                    Upload audio file(s)
                  </ActionMenuItem>
                </>
              )}
            </ActionMenu>
          </span>
        </div>
        {!audioMinimized && albumView && (
          <BandAlbumList
            bandId={bandId}
            albums={albums}
            conversations={conversations}
            search={search}
            bandName={bandName}
            rowsDisabled={rowsDisabled}
            onAddToSetlist={onAddToSetlist}
            onAddToAlbum={setAlbumTarget}
            onEditSong={onEditSong}
            onViewSong={onViewSong}
            onToggleArchive={onToggleArchive}
            onDelete={onDelete}
          />
        )}
        {!audioMinimized &&
          !albumView &&
          activeSongs &&
          activeSongs.length === 0 && (
            <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
              No songs yet. Use the ⋯ menu above to “Create song without audio”
              from a name, or “Upload audio file(s)”{' '}
              {canUseDrive ? 'from Drive or your device' : 'from your device'}.
            </p>
          )}
        {!audioMinimized &&
          !albumView &&
          activeSongs &&
          activeSongs.length > 0 &&
          visibleActive &&
          visibleActive.length === 0 && (
            <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
              No audio matches “{search.trim()}”.
            </p>
          )}
        {!audioMinimized &&
          !albumView &&
          visibleActive &&
          visibleActive.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {visibleActive.map(row)}
            </ul>
          )}
      </section>

      {!albumView && archivedSongs.length > 0 && (
        <section className="flex flex-col gap-2">
          <MinimizeToggle
            minimized={archivedMinimized}
            onToggle={() => setArchivedMinimized((v) => !v)}
            label="Archived Audio"
          >
            <h2 className="text-sm font-medium minor-text-theme-colors">
              Archived Audio
            </h2>
          </MinimizeToggle>
          {!archivedMinimized && visibleArchived.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {visibleArchived.map(row)}
            </ul>
          )}
          {!archivedMinimized && visibleArchived.length === 0 && (
            <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
              No archived audio matches “{search.trim()}”.
            </p>
          )}
        </section>
      )}

      {albumTarget && (
        <AddToAlbumModal
          bandId={bandId}
          target={albumTarget}
          onClose={() => setAlbumTarget(null)}
          // The cached album list is now stale — drop it so album view
          // refetches rather than showing a song it doesn't know was added.
          onAdded={() => setAlbums(null)}
        />
      )}
    </>
  );
}
