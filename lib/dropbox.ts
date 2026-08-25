import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * Dropbox Chooser imports. The Chooser (client-side) hands back a short-lived
 * *direct* download link, so — unlike Drive — there's no OAuth/token dance:
 * the server just downloads the link. Because that URL comes from the client,
 * we restrict it to Dropbox's own content hosts before fetching (SSRF guard),
 * the same way push endpoints are validated.
 */

/** True only for an HTTPS Dropbox content URL (a Chooser `direct` link). */
function isAllowedDropboxUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return (
    host === 'dropboxusercontent.com' ||
    host.endsWith('.dropboxusercontent.com')
  );
}

export interface FetchedDropboxFile {
  body: Readable;
  /** From the response's Content-Length; 0 if the server didn't send one. */
  sizeBytes: number;
  /** Bare MIME type (no parameters), or '' if absent. */
  contentType: string;
}

/**
 * Download a Dropbox Chooser direct link as a Node stream. Returns null if the
 * URL isn't an allowed Dropbox host or the download can't be started; the
 * caller enforces size/type limits and stores the stream.
 */
export async function fetchDropboxFile(
  url: string,
): Promise<FetchedDropboxFile | null> {
  if (!isAllowedDropboxUrl(url)) return null;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (!res.ok || !res.body) return null;
  const sizeBytes = Number(res.headers.get('content-length') ?? 0) || 0;
  const contentType = (res.headers.get('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  const body = Readable.fromWeb(res.body as unknown as NodeWebReadableStream);
  return { body, sizeBytes, contentType };
}
