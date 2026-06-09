import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';

/**
 * Streaming proxy for audio files in Drive.
 *
 * The browser's <audio> element (and Howler's HTML5 mode) needs a real
 * URL that supports Range requests. Drive's media-download endpoint
 * does support Range, but it requires an OAuth bearer token on every
 * request — we can't put that in a <src> attribute. So this route sits
 * in between: takes the request from the browser, forwards it to Drive
 * with the user's token, and proxies the response back.
 *
 * Range support is critical:
 *   - The client's Range header is forwarded to Drive
 *   - Drive's Content-Range, Content-Length, Accept-Ranges, Content-Type
 *     are proxied back
 *   - We return 206 Partial Content when Drive does; 200 otherwise
 *
 * Authorization is delegated to Drive: each user streams with their
 * own access token, so revoking access in Drive immediately cuts off
 * playback for that user.
 */

/**
 * Vercel / managed-host knobs.
 *
 * - `runtime = 'nodejs'`: `googleapis` is Node-only, and `Readable.toWeb`
 *   isn't available on Edge.
 * - `dynamic = 'force-dynamic'`: never cache the proxied stream — it's
 *   per-user and revocable.
 * - `maxDuration = 300`: 5 minutes. A single Range chunk is fast, but
 *   the browser may hold a long-tail Range open until the user pauses,
 *   especially with Howler's HTML5 mode. 300s covers any reasonable
 *   slice; the browser issues a new request when it needs more.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();

  if (!session) {
    return new Response('unauthenticated', { status: 401 });
  }
  if (session.error === 'RefreshAccessTokenError') {
    return new Response('refresh_failed', { status: 401 });
  }
  if (!hasAllDriveScopes(session.scopes)) {
    return new Response('scope_missing', { status: 403 });
  }
  if (!session.accessToken) {
    return new Response('no_token', { status: 401 });
  }

  const { fileId } = await params;
  if (!isValidDriveId(fileId)) {
    return new Response('invalid_file_id', { status: 400 });
  }

  // Optional `?name=<filename>` hint from the client. Used purely to
  // recover the correct `Content-Type` when Drive returns a generic
  // value. Trusting it is safe: it can only ever loosen our guess at
  // the file's audio type, never escalate privileges.
  const reqUrl = new URL(req.url);
  const nameHint = reqUrl.searchParams.get('name');

  const range = req.headers.get('range') ?? undefined;
  const drive = getDriveClient(session.accessToken);

  try {
    const driveRes = await drive.files.get(
      { fileId, alt: 'media' },
      {
        responseType: 'stream',
        headers: range ? { Range: range } : undefined,
      },
    );

    // Build response headers, preserving what Drive returned where it
    // makes sense. We always advertise Range support.
    const headers = new Headers();
    headers.set('Accept-Ranges', 'bytes');

    const driveContentType = driveRes.headers['content-type'];
    const resolvedContentType = resolveContentType(
      driveContentType ? String(driveContentType) : null,
      nameHint,
    );
    if (resolvedContentType) headers.set('Content-Type', resolvedContentType);

    const contentLength = driveRes.headers['content-length'];
    if (contentLength) headers.set('Content-Length', String(contentLength));

    const contentRange = driveRes.headers['content-range'];
    if (contentRange) headers.set('Content-Range', String(contentRange));

    // Allow the user's own browser to cache Range chunks briefly so
    // that seeks inside a playback session don't re-pay the Drive
    // round-trip. `private` keeps shared proxies (Vercel, ISPs) out of
    // the loop; the short TTL bounds storage on mobile and limits how
    // long a chunk survives a Drive permission revocation.
    headers.set('Cache-Control', 'private, max-age=300');

    // googleapis returns a Node Readable; Response needs a Web stream.
    const nodeStream = driveRes.data as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    const status = typeof driveRes.status === 'number' ? driveRes.status : 200;
    return new Response(webStream, { status, headers });
  } catch (err) {
    const status =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code) || 500
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[drive/stream] failed', { fileId, status, message });
    // Drive's 404 leaks the existence of files we can't access; treat
    // it as 403 to clients.
    const mappedStatus =
      status === 404 ? 403 : status >= 400 && status < 500 ? status : 500;
    return new Response(message, { status: mappedStatus });
  }
}

/**
 * Choose the response `Content-Type`, preferring Drive's value but
 * falling back to a filename-derived `audio/*` type when Drive returns
 * either no type or a generic one (most commonly `application/octet-stream`
 * for files whose upload metadata was lost).
 *
 * Firefox mobile's media engine is much stricter than Chrome's about
 * the `Content-Type` matching the bytes it's decoding. Returning
 * `application/octet-stream` causes Firefox to refuse playback
 * outright, even though Range support and the actual data are fine.
 * Substituting a concrete `audio/*` value resolves that without
 * touching the bytes themselves.
 */
function resolveContentType(
  driveType: string | null,
  nameHint: string | null,
): string | null {
  // Trust Drive's value unless it's missing or generic.
  if (driveType && driveType !== 'application/octet-stream') return driveType;

  const derived = extensionToAudioMime(nameHint);
  if (derived) return derived;

  return driveType; // null or octet-stream — better to send something than nothing
}

function extensionToAudioMime(name: string | null): string | null {
  if (!name) return null;
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'mp4':
    case 'm4a':
      return 'audio/mp4';
    case 'wav':
    case 'wave':
      return 'audio/wav';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'opus':
      return 'audio/opus';
    case 'webm':
      return 'audio/webm';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'aiff':
    case 'aif':
      return 'audio/aiff';
    default:
      return null;
  }
}
