'use client';

import { useState } from 'react';
import { MinimizeToggle, type Conversation } from './bandDetailShared';
import { SongRow } from './SongRow';

/**
 * The Audio tab: a search box that filters both the active Audio list and the
 * Archived Audio list (each within its own collapsible container). Owns its
 * search and minimize UI state; the parent supplies the songs and the row
 * action handlers, and owns the "Add audio" source modal.
 */
export function BandAudioTab({
  conversations,
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
  conversations: Conversation[] | null;
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
      disabled={rowsDisabled}
      onAddToSetlist={onAddToSetlist}
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
        placeholder="Search audio…"
        aria-label="Search audio"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:placeholder:text-neutral-500"
      />
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <MinimizeToggle
              minimized={audioMinimized}
              onToggle={() => setAudioMinimized((v) => !v)}
              label="Audio"
            >
              <h2 className="text-sm font-medium">Audio</h2>
            </MinimizeToggle>
            {importProgress && (
              <span className="truncate text-xs text-neutral-500">
                Importing {importProgress.current} of {importProgress.total}…
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateSong}
              disabled={audioBusy || importProgress !== null}
              className="btn-outline"
            >
              Create song
            </button>
            <button
              type="button"
              onClick={onOpenChooser}
              disabled={audioBusy || importProgress !== null}
              className="btn-outline"
            >
              {importProgress
                ? 'Importing…'
                : audioBusy
                  ? 'Adding…'
                  : 'Add audio'}
            </button>
          </div>
        </div>
        {!audioMinimized && activeSongs && activeSongs.length === 0 && (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No songs yet. Use “Create song” to start one from a name, or “Add
            audio” to add{' '}
            {canUseDrive ? 'from Drive or your device' : 'from your device'}.
          </p>
        )}
        {!audioMinimized &&
          activeSongs &&
          activeSongs.length > 0 &&
          visibleActive &&
          visibleActive.length === 0 && (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
              No audio matches “{search.trim()}”.
            </p>
          )}
        {!audioMinimized && visibleActive && visibleActive.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {visibleActive.map(row)}
          </ul>
        )}
      </section>

      {archivedSongs.length > 0 && (
        <section className="flex flex-col gap-2">
          <MinimizeToggle
            minimized={archivedMinimized}
            onToggle={() => setArchivedMinimized((v) => !v)}
            label="Archived Audio"
          >
            <h2 className="text-sm font-medium text-neutral-500">
              Archived Audio
            </h2>
          </MinimizeToggle>
          {!archivedMinimized && visibleArchived.length > 0 && (
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {visibleArchived.map(row)}
            </ul>
          )}
          {!archivedMinimized && visibleArchived.length === 0 && (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
              No archived audio matches “{search.trim()}”.
            </p>
          )}
        </section>
      )}
    </>
  );
}
