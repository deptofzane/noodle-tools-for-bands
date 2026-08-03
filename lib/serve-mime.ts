/**
 * The Content-Type a stored song file is served with.
 *
 * These files stream from our own origin with `Content-Disposition: inline`,
 * so this header decides whether the browser treats the bytes as media or as a
 * document that can run script against the session. `text/html` and
 * `image/svg+xml` must never come out of here.
 *
 * Ingest already screens what goes in — `normalizeAudioMime` for audio, the
 * sheet-music allowlist for the rest. This is the second lock: whatever is in
 * the column (a row from before those checks, a future import path, a
 * hand-edited record) can't become an executable document on the way out.
 */

/** Types safe to declare on an inline, same-origin response. */
export function isServableType(mime: string): boolean {
  const base = mime.split(';')[0]!.trim().toLowerCase();
  return (
    base.startsWith('audio/') ||
    base === 'application/pdf' ||
    base === 'text/plain' ||
    base === 'text/markdown' ||
    base === 'text/csv' ||
    base === 'image/png' ||
    base === 'image/jpeg' ||
    base === 'image/gif' ||
    base === 'image/webp'
  );
}

const EXT_TO_SERVED_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * Prefer the stored MIME, falling back to the file name's extension when it's
 * missing or generic (Drive labels the same `.mp3` half a dozen ways, and
 * Firefox is strict about the header). Anything not on the servable list
 * becomes an opaque download instead.
 */
export function resolveContentType(mime: string, name: string | null): string {
  if (mime && mime !== 'application/octet-stream') {
    return isServableType(mime) ? mime : 'application/octet-stream';
  }
  const ext = name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (ext && EXT_TO_SERVED_MIME[ext]) || 'application/octet-stream';
}
