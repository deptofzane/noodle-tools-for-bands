import type { AlbumTrack, AlbumWithTracks } from '@/lib/db/albums';

/**
 * What the Songs tab's album view shows for a given search.
 *
 * Pure, and separate from the component, because the rules have more corners
 * than they look:
 *
 *   - An album whose *name* matches shows all of its tracks. Someone searching
 *     "Demos" wants the record, not the subset of its songs that happen to
 *     contain the word.
 *   - Otherwise an album shows only its matching tracks, and drops out when
 *     none match.
 *   - Which albums are *open* is the union of the user's own choice and
 *     whatever the search hit — and the search half is never written back to
 *     the persisted set, or typing would permanently rearrange their view.
 */
export interface AlbumViewGroup {
  album: AlbumWithTracks;
  /** Tracks to show — all of them when the album name matched. */
  tracks: AlbumTrack[];
  /** True when this album is here because its name matched, not its songs. */
  nameMatched: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

export function filterAlbums(
  albums: AlbumWithTracks[],
  search: string,
): AlbumViewGroup[] {
  const q = norm(search);
  if (!q)
    return albums.map((album) => ({
      album,
      tracks: album.tracks,
      nameMatched: false,
    }));

  const out: AlbumViewGroup[] = [];
  for (const album of albums) {
    if (norm(album.name).includes(q)) {
      out.push({ album, tracks: album.tracks, nameMatched: true });
      continue;
    }
    const tracks = album.tracks.filter((t) => norm(t.name).includes(q));
    if (tracks.length > 0) out.push({ album, tracks, nameMatched: false });
  }
  return out;
}

/**
 * Which albums render expanded.
 *
 * `openIds` is the user's persisted choice; while a search is running, anything
 * the search surfaced is opened on top of it — otherwise a match would be
 * hidden inside a collapsed album and read as "no results". Returning a fresh
 * set rather than mutating `openIds` is the point: the caller persists only
 * what the user toggled.
 */
export function effectiveOpen(
  groups: AlbumViewGroup[],
  openIds: Set<string>,
  search: string,
): Set<string> {
  if (!norm(search)) return openIds;
  const next = new Set(openIds);
  for (const g of groups) next.add(g.album.id);
  return next;
}

/**
 * Songs on no album at all — the "Unassociated" group.
 *
 * Filtered by song name only (an album name match says nothing about a song
 * that isn't on one), and the caller hides the group when this is empty.
 */
export function unassociated<T extends { id: string; name: string }>(
  songs: T[],
  albums: AlbumWithTracks[],
  search: string,
): T[] {
  const filed = new Set<string>();
  for (const a of albums)
    for (const t of a.tracks) filed.add(t.conversationId);
  const q = norm(search);
  return songs
    .filter((s) => !filed.has(s.id))
    .filter((s) => !q || norm(s.name).includes(q));
}
