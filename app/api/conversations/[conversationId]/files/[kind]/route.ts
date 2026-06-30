import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  deleteSongFile,
  getSongFileMeta,
  putSongFile,
  readSongFileRange,
  type SongFileKind,
} from '@/lib/db/song-files';

/**
 * Song file endpoint, shared by every file kind (audio, sheet music).
 *
 *   GET    /api/conversations/[id]/files/[kind]   → stream the bytes (Range)
 *   POST   /api/conversations/[id]/files/sheet_music  (multipart `file`)  → upload/replace
 *   DELETE /api/conversations/[id]/files/sheet_music  → remove
 *
 * Audio is imported from Drive at registration, so upload/delete are only
 * for sheet music; audio is read-only here. All band-membership gated.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS: SongFileKind[] = ['audio', 'sheet_music'];
const MAX_SHEET_BYTES = 25 * 1024 * 1024; // 25 MB

function parseKind(raw: string): SongFileKind | null {
  return (VALID_KINDS as string[]).includes(raw) ? (raw as SongFileKind) : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string; kind: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return new Response('unauthenticated', { status: 401 });
  const { conversationId, kind: rawKind } = await params;
  const kind = parseKind(rawKind);
  if (!kind) return new Response('bad_kind', { status: 404 });

  if (!(await getConversationMembership(user.id, conversationId))) {
    return new Response('forbidden', { status: 403 });
  }

  const meta = await getSongFileMeta(conversationId, kind);
  if (!meta) return new Response('not_found', { status: 404 });

  const total = meta.sizeBytes;
  const nameHint = new URL(req.url).searchParams.get('name');
  const contentType = resolveContentType(meta.mimeType, nameHint ?? meta.fileName);
  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': `inline; filename="${sanitizeFilename(meta.fileName)}"`,
  };

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
      const chunk = await readSongFileRange(conversationId, kind, start, length);
      if (!chunk) return new Response('not_found', { status: 404 });
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${total}`,
        },
      });
    }
  }

  const chunk = await readSongFileRange(conversationId, kind, 0, total);
  if (!chunk) return new Response('not_found', { status: 404 });
  return new Response(new Uint8Array(chunk), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(total) },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string; kind: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, kind: rawKind } = await params;
  if (rawKind !== 'sheet_music') {
    return Response.json(
      { error: 'unsupported', message: 'Only sheet music can be uploaded here.' },
      { status: 400 },
    );
  }
  if (!(await getConversationMembership(user.id, conversationId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: 'no_file', message: 'A file is required.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_SHEET_BYTES) {
    return Response.json(
      { error: 'file_too_large', message: 'Sheet music exceeds the 25 MB limit.' },
      { status: 413 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || 'sheet-music';
  const mimeType = file.type || 'application/octet-stream';
  await putSongFile({ conversationId, kind: 'sheet_music', data, fileName, mimeType });
  return Response.json({ sheetMusic: { fileName, mimeType } }, { status: 201 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string; kind: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, kind: rawKind } = await params;
  if (rawKind !== 'sheet_music') {
    return Response.json({ error: 'unsupported' }, { status: 400 });
  }
  if (!(await getConversationMembership(user.id, conversationId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  await deleteSongFile(conversationId, 'sheet_music');
  return new Response(null, { status: 204 });
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
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain; charset=utf-8';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return mime || 'application/octet-stream';
  }
}

/** Strip characters that would break the Content-Disposition header. */
function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, '_');
}
