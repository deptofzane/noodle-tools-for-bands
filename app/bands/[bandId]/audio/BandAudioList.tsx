'use client';

import { useState } from 'react';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { Spinner } from '../../../Spinner';
import { MinimizeToggle, type Conversation } from '../bandDetailShared';
import { SongRow } from './SongRow';

/**
 * The Audio page's body: a search box that filters both the active Audio list
 * and the Archived Audio list (each within its own collapsible container). Owns
 * its search and minimize UI state; the parent supplies the songs and the row
 * action handlers, and owns the "Add audio" source modal.
 */
export function BandAudioList({
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
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:minor-text-theme-colors"
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
            {/* Progress sits beside the heading now that the actions are in a
                menu: a disabled kebab can't be opened to read a busy label, so
                this is the only place the work is visible. `role="status"` is
                on the wrapper so the count itself is what gets announced. */}
            {importProgress || audioBusy ? (
              <span
                role="status"
                className="flex min-w-0 items-center gap-1.5"
              >
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
          <ActionMenu
            label="Audio actions"
            disabled={audioBusy || importProgress !== null}
          >
            <ActionMenuItem onClick={onCreateSong}>Create song without audio</ActionMenuItem>
            <ActionMenuItem onClick={onOpenChooser}>Upload audio file(s)</ActionMenuItem>
          </ActionMenu>
        </div>
        {!audioMinimized && activeSongs && activeSongs.length === 0 && (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
            No songs yet. Use the ⋯ menu above to “Create song without audio” from a name, or
            “Upload audio file(s)”{' '}
            {canUseDrive ? 'from Drive or your device' : 'from your device'}.
          </p>
        )}
        {!audioMinimized &&
          activeSongs &&
          activeSongs.length > 0 &&
          visibleActive &&
          visibleActive.length === 0 && (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
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
            <h2 className="text-sm font-medium minor-text-theme-colors">
              Archived Audio
            </h2>
          </MinimizeToggle>
          {!archivedMinimized && visibleArchived.length > 0 && (
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {visibleArchived.map(row)}
            </ul>
          )}
          {!archivedMinimized && visibleArchived.length === 0 && (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
              No archived audio matches “{search.trim()}”.
            </p>
          )}
        </section>
      )}
    </>
  );
}
