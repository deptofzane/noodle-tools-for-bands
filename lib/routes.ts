/**
 * URLs for the setlist practice/performance screens.
 *
 * These live on query params rather than path segments — `/practice?setlist=…`
 * instead of `/bands/…/setlists/…/practice` — so that there is exactly one
 * HTML document per screen no matter how many setlists exist. That document
 * can then be precached and refreshed with every deploy, which is what makes
 * the screens survive offline (see app/sw.ts). The setlist id is a UUID, so it
 * identifies its band on its own.
 *
 * Shareable: paste either URL to a bandmate and they land in the same place,
 * on the same song when `song` is included.
 */

/** Practice a setlist, optionally opening on a given position (0-based). */
export function practiceHref(setlistId: string, song?: number): string {
  const q = new URLSearchParams({ setlist: setlistId });
  if (song != null && song > 0) q.set('song', String(song + 1));
  return `/practice?${q}`;
}

/** Live (full-screen sheet music) for a setlist, optionally at a position. */
export function liveHref(setlistId: string, song?: number): string {
  const q = new URLSearchParams({ setlist: setlistId });
  if (song != null && song > 0) q.set('song', String(song + 1));
  return `/live?${q}`;
}

/** The setlist's songs, enriched for Practice/Live. */
export function practiceSongsApi(setlistId: string): string {
  return `/api/setlists/${setlistId}/practice-songs`;
}

/**
 * Read `?song=` as a 0-based index. It's 1-based in the URL — a link that says
 * "song 7" should be the seventh song. Anything unparseable is ignored.
 */
export function songParamToIndex(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n - 1;
}
