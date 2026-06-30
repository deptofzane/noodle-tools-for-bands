import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSongFileMeta, readSongFileRange } from '@/lib/db/song-files';

/**
 * GET /api/conversations/[conversationId]/audio
 *   → Streams the song's audio bytes from Postgres, with Range support
 *     (the player seeks via Range). Band-membership gated. Replaces the
 *     old Drive streaming proxy — audio now lives in our DB.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return new Response('unauthenticated', { status: 401 });
  const { conversationId } = await params;

  if (!(await getConversationMembership(user.id, conversationId))) {
    return new Response('forbidden', { status: 403 });
  }

  const meta = await getSongFileMeta(conversationId, 'audio');
  if (!meta) return new Response('no_audio', { status: 404 });

  const total = meta.sizeBytes;
  const nameHint = new URL(req.url).searchParams.get('name');
  const contentType = resolveContentType(meta.mimeType, nameHint ?? meta.fileName);

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (!Number.isFinite(start)) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        return new Response('range_not_satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` },
        });
      }
      const length = end - start + 1;
      const chunk = await readSongFileRange(conversationId, 'audio', start, length);
      if (!chunk) return new Response('no_audio', { status: 404 });
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=300',
        },
      });
    }
  }

  // Whole file.
  const chunk = await readSongFileRange(conversationId, 'audio', 0, total);
  if (!chunk) return new Response('no_audio', { status: 404 });
  return new Response(new Uint8Array(chunk), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

/** Prefer the stored MIME; derive an `audio/*` type from the name when generic. */
function resolveContentType(mime: string, name: string | null): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
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
    default:
      return mime || 'application/octet-stream';
  }
}
