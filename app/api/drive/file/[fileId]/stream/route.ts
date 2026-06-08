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

    const contentType = driveRes.headers['content-type'];
    if (contentType) headers.set('Content-Type', String(contentType));

    const contentLength = driveRes.headers['content-length'];
    if (contentLength) headers.set('Content-Length', String(contentLength));

    const contentRange = driveRes.headers['content-range'];
    if (contentRange) headers.set('Content-Range', String(contentRange));

    // Don't let intermediaries cache the proxied stream — the URL is
    // per-user and the underlying access is revocable.
    headers.set('Cache-Control', 'private, no-store');

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
