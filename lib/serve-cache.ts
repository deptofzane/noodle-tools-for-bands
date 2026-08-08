import type { SongFileKind } from './db/song-files';

/**
 * How long the browser may keep a song file's bytes.
 *
 * `private` throughout — every one of these responses is membership-gated and
 * must never land in a shared cache.
 *
 * A URL that names a version it can't outlive is cacheable forever, which is
 * the point of naming one (see `audioSrc`): a player re-opening a song on
 * venue wifi shouldn't spend a round-trip revalidating bytes that cannot have
 * changed. That holds unconditionally for audio — `addAudioVersion` always
 * writes a new object, so a version's bytes are never rewritten — but *not*
 * for sheet music, whose ChordPro editor replaces a version's content in
 * place (`updateSheetVersionContent`). Sheet URLs carry `?v=<updatedAt>` for
 * exactly that reason, and every reader in the app sends it; without it we
 * fall back to revalidating.
 *
 * The versionless default is a moving target — the song's default version can
 * change under it — so it stays short-lived.
 *
 * One consequence: `Content-Disposition` names the file as it was when the
 * response was cached, so a rename won't reach a client that already has the
 * bytes. That only affects the suggested filename on save.
 */
export function fileCacheControl(
  kind: SongFileKind,
  versionId: string | null,
  search: URLSearchParams,
): string {
  const pinned =
    versionId !== null && (kind === 'audio' || search.get('v') !== null);
  return pinned
    ? 'private, max-age=31536000, immutable'
    : 'private, max-age=300';
}
