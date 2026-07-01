import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  deleteSongFile,
  getSongFileMeta,
  putSongFile,
  streamSongFile,
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

  const nameHint = new URL(req.url).searchParams.get('name');
  const contentType = resolveContentType(meta.mimeType, nameHint ?? meta.fileName);
  const rangeHeader = req.headers.get('range') ?? undefined;

  let result;
  try {
    result = await streamSongFile(conversationId, kind, rangeHeader);
  } catch (err) {
    // Range the store can't satisfy → 416; anything else → 502.
    if (isRangeError(err)) {
      return new Response('range_not_satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${meta.sizeBytes}` },
      });
    }
    console.error('[files] stream failed', err);
    return new Response('storage_error', { status: 502 });
  }
  if (!result) return new Response('not_found', { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': `inline; filename="${sanitizeFilename(meta.fileName)}"`,
    // Don't let the browser re-interpret the bytes (e.g. a .txt sniffed as
    // HTML) — these are embedded same-origin.
    'X-Content-Type-Options': 'nosniff',
  };
  if (result.contentLength != null)
    headers['Content-Length'] = String(result.contentLength);
  if (result.contentRange) headers['Content-Range'] = result.contentRange;

  const webStream = Readable.toWeb(result.body) as ReadableStream<Uint8Array>;
  return new Response(webStream, { status: result.status, headers });
}

function isRangeError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'InvalidRange' || e.$metadata?.httpStatusCode === 416;
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

  // Import from Google Drive: JSON { driveFileId } → download with the
  // user's token and store, mirroring the audio-registration import.
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await req.json().catch(() => null);
    const driveFileId =
      typeof body?.driveFileId === 'string' ? body.driveFileId.trim() : '';
    if (!driveFileId) {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
    const session = await auth();
    if (!session?.accessToken) {
      return Response.json(
        { error: 'no_token', message: 'Connect Google Drive to import from it.' },
        { status: 401 },
      );
    }
    try {
      const drive = getDriveClient(session.accessToken);
      const metaRes = await drive.files.get({
        fileId: driveFileId,
        fields: 'name, mimeType, size',
      });
      const fileName = metaRes.data.name ?? 'sheet-music';
      const mimeType = normalizeSheetMime(metaRes.data.mimeType ?? '', fileName);
      if (!mimeType) {
        return Response.json(
          {
            error: 'unsupported_type',
            message: 'Allowed: PDF, plain text/markdown, or a PNG/JPEG/GIF/WEBP image.',
          },
          { status: 415 },
        );
      }
      const declaredSize = Number(metaRes.data.size ?? 0);
      if (declaredSize && declaredSize > MAX_SHEET_BYTES) {
        return Response.json(
          { error: 'file_too_large', message: 'Sheet music exceeds the 25 MB limit.' },
          { status: 413 },
        );
      }
      const mediaRes = await drive.files.get(
        { fileId: driveFileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const data = Buffer.from(mediaRes.data as ArrayBuffer);
      if (data.length > MAX_SHEET_BYTES) {
        return Response.json(
          { error: 'file_too_large', message: 'Sheet music exceeds the 25 MB limit.' },
          { status: 413 },
        );
      }
      const stored = await putSongFile({
        conversationId,
        kind: 'sheet_music',
        data,
        fileName,
        mimeType,
        driveFileId,
      });
      return Response.json({ sheetMusic: stored }, { status: 201 });
    } catch (err) {
      console.error('[files] sheet-music Drive import failed', err);
      return Response.json(
        { error: 'import_failed', message: 'Could not import the file from Drive.' },
        { status: 502 },
      );
    }
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

  const fileName = file.name || 'sheet-music';
  // Allowlist the content type — `accept` on the input is only a hint,
  // and serving arbitrary user files inline (HTML/SVG) is an XSS vector.
  const mimeType = normalizeSheetMime(file.type, fileName);
  if (!mimeType) {
    return Response.json(
      {
        error: 'unsupported_type',
        message: 'Allowed: PDF, plain text/markdown, or a PNG/JPEG/GIF/WEBP image.',
      },
      { status: 415 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  const meta = await putSongFile({
    conversationId,
    kind: 'sheet_music',
    data,
    fileName,
    mimeType,
  });
  return Response.json({ sheetMusic: meta }, { status: 201 });
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

/**
 * Resolve an uploaded sheet-music file to an allowed MIME type, or null
 * to reject it. Only types safe to embed inline are permitted — notably
 * NOT text/html or image/svg+xml, which can execute scripts same-origin.
 * Falls back to the filename extension when the browser-supplied type is
 * missing or generic.
 */
const ALLOWED_SHEET_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

function normalizeSheetMime(rawMime: string, fileName: string): string | null {
  const mime = (rawMime || '').toLowerCase().split(';')[0]!.trim();
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

  // Hard rejects (scriptable inline).
  if (mime === 'text/html' || ext === 'html' || ext === 'htm') return null;
  if (mime === 'image/svg+xml' || ext === 'svg') return null;

  if (ALLOWED_SHEET_MIMES.has(mime)) return mime;
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  return null;
}
