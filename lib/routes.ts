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
 * Canonical pages for the things people share.
 *
 * Collected here because a shared link has to be the *clean* address of a
 * thing, and these are built in half a dozen menus. Reading `window.location`
 * instead would copy whatever query params the reader happened to arrive
 * with — a `?from=calendar` back-link, a `?tab=` — and paste them to someone
 * for whom they mean nothing.
 */
export function eventHref(eventId: string): string {
  return `/calendar/events/${eventId}`;
}

export function setlistHref(bandId: string, setlistId: string): string {
  return `/bands/${bandId}/setlists/${setlistId}`;
}

/**
 * A song's page. Songs are conversations; the id is the conversation's.
 *
 * That page is Practice: it does everything the old song screen did and more,
 * so the song screen was retired rather than kept as a lesser twin.
 * `/notes/<id>` still resolves — it redirects here — which is what keeps links
 * shared before the change working.
 */
export function songHref(conversationId: string): string {
  return `/notes/${conversationId}/practice`;
}

export function albumHref(bandId: string, albumId: string): string {
  return `/bands/${bandId}/albums/${albumId}`;
}

export function noteHref(bandId: string, noteId: string): string {
  return `/bands/${bandId}/notes/${noteId}`;
}

export function todoHref(bandId: string, todoId: string): string {
  return `/bands/${bandId}/todos/${todoId}`;
}

export function venueHref(bandId: string, venueId: string): string {
  return `/bands/${bandId}/venues/${venueId}`;
}

/**
 * Where switching the current band should land you.
 *
 * Switching bands used to always push Overview, which threw away wherever you
 * were — change band from the Calendar and you had to navigate back to it.
 * The rule now is "stay put unless the URL names the band you just left":
 *
 *   - Nothing band-specific in the path (`/home`, `/calendar`, `/settings`,
 *     a song, a practice screen) → `null`, meaning don't navigate at all. The
 *     current band is only a pointer for the nav; the page is still the page.
 *   - The band's own pages (`/bands/[id]`, `/bands/[id]/audio`) → the same
 *     page of the new band, query string and all, so the open tab survives
 *     the switch.
 *   - Anything deeper → that URL names one of the *old* band's setlists,
 *     polls, venues or notes, and the new band has no such thing. Falls back
 *     to the new band's Overview rather than 404ing or, worse, resolving to
 *     something that isn't what the URL described. Half-filled `new`/`edit`
 *     forms land there too — carrying the path over would imply the entered
 *     text came with it.
 *
 * Returns an absolute path, or null to stay where you are.
 */
export function bandSwitchTarget(
  pathname: string,
  search: string,
  nextBandId: string,
): string | null {
  const match = /^\/bands\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;

  const [, currentBandId, rest = ''] = match;
  // Already there — `/bands` itself never matches, so the band list stays put.
  if (currentBandId === nextBandId) return null;

  const section = rest.replace(/\/$/, '');
  if (section === '' || section === '/audio') {
    return `/bands/${nextBandId}${section}${search}`;
  }
  return `/bands/${nextBandId}`;
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
