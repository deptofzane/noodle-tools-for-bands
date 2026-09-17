'use client';

export type SongSortKey = 'name' | 'date';

export interface SongSort {
  key: SongSortKey;
  dir: 'asc' | 'desc';
}

/** What a song is called in a list — the fallback every song list uses. */
export const songDisplayName = (c: { audioFileName: string | null }) =>
  c.audioFileName ?? 'Untitled audio';

/**
 * Newest first. An audio list is read from the most recent addition, and the
 * archive from the most recently put away.
 */
export const DEFAULT_SONG_SORT: SongSort = { key: 'date', dir: 'desc' };

/**
 * What pressing a sort button does: the active column reverses, a new one
 * starts on its own sensible end — dates newest-first, names A–Z.
 */
export const nextSongSort = (prev: SongSort, key: SongSortKey): SongSort =>
  prev.key === key
    ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'date' ? 'desc' : 'asc' };

/**
 * Sort a copy of `rows`. `createdAt` is when the song joined the band, which
 * is what "uploaded" means here — the Uploads history sorts on it too.
 */
export function sortSongs<
  T extends { audioFileName: string | null; createdAt: string },
>(rows: T[], sort: SongSort): T[] {
  return [...rows].sort((a, b) => {
    const by =
      sort.key === 'name'
        ? songDisplayName(a).localeCompare(songDisplayName(b))
        : // ISO timestamps, so a string compare is a date compare.
          a.createdAt.localeCompare(b.createdAt);
    return sort.dir === 'asc' ? by : -by;
  });
}

/**
 * The Name / Date uploaded pair, shared by the Songs list and History's
 * Archived Audio so the two behave identically — including which way a first
 * press points.
 */
export function SongSortButtons({
  sort,
  onSort,
}: {
  sort: SongSort;
  onSort: (key: SongSortKey) => void;
}) {
  const button = (id: SongSortKey, label: string) => (
    <button
      type="button"
      onClick={() => onSort(id)}
      aria-pressed={sort.key === id}
      className={
        'rounded-md border px-2.5 py-1 text-xs font-medium transition ' +
        (sort.key === id
          ? 'border-line-strong text-accent'
          : 'border-line minor-text-theme-colors hover:text-fg-strong')
      }
    >
      {label}
      {sort.key === id && (
        <span aria-hidden="true"> {sort.dir === 'asc' ? '▲' : '▼'}</span>
      )}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs minor-text-theme-colors">Sort by</span>
      {button('name', 'Name')}
      {button('date', 'Date uploaded')}
    </div>
  );
}
