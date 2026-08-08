/**
 * The cache key the service worker files audio bytes under.
 *
 * Kept out of `app/sw.ts` so it can be tested: the worker imports Serwist and
 * `self`, neither of which loads under Node. The rule is one line and easy to
 * "tidy" into something wrong, and getting it wrong means a song plays someone
 * else's take from cache — worth pinning.
 *
 * Two query params reach these URLs. `version` names *which bytes*, so it has
 * to be part of the key. `name` only sets the download filename and differs
 * between the player (the stored file name) and the offline download (the
 * setlist's display name) for the very same audio — so it must not split the
 * entry in two.
 *
 * A URL with no `version` is left keyless on purpose rather than normalised to
 * "the default": which version is default changes over time, and caching a
 * moving target under a fixed key is the bug this exists to prevent.
 */
export function canonicalAudioKey(url: string): string {
  const u = new URL(url, 'https://noodle.invalid');
  const version = u.searchParams.get('version');
  u.search = version ? `?version=${version}` : '';
  return u.pathname + u.search;
}
