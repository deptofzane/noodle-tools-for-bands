import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import {
  deleteConversation,
  findOrCreateConversation,
  listBandConversations,
} from '@/lib/db/conversations';
import { hasSongFile, putSongFile } from '@/lib/db/song-files';

// Cap imported audio to keep object storage + a memory buffer sane.
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB

// Local audio has no Drive id; mint a synthetic one so the conversation's
// (band, drive_audio_file_id) key stays satisfied. Playback reads from
// object storage, so nothing resolves this value against Drive.
function localAudioId(): string {
  return `local-${randomUUID()}`;
}

/** Audio types we accept for local upload (extension fallback below). */
const AUDIO_EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

/** Resolve a local upload to an audio MIME type, or null to reject it. */
function normalizeAudioMime(rawMime: string, fileName: string): string | null {
  const mime = (rawMime || '').toLowerCase().split(';')[0]!.trim();
  if (mime.startsWith('audio/')) return mime;
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && AUDIO_EXT_TO_MIME[ext]) return AUDIO_EXT_TO_MIME[ext];
  return null;
}

/**
 * GET  /api/bands/[bandId]/conversations
 *   → conversations (registered audio) in the band, newest activity first.
 *
 * POST /api/bands/[bandId]/conversations
 *   Body: { driveAudioFileId: string, audioFileName?: string }
 *   → registers a Drive audio file under the band (find-or-create).
 *
 * Both require band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ conversations: await listBandConversations(bandId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Local upload: multipart `file` → new conversation + stored audio,
  // no Drive round-trip. Mirrors the Drive import below.
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0)
      return NextResponse.json(
        { error: 'no_file', message: 'A file is required.' },
        { status: 400 },
      );
    if (file.size > MAX_AUDIO_BYTES)
      return NextResponse.json(
        { error: 'file_too_large', message: 'Audio exceeds the 100 MB limit.' },
        { status: 413 },
      );
    const fileName = file.name || 'audio';
    const mimeType = normalizeAudioMime(file.type, fileName);
    if (!mimeType)
      return NextResponse.json(
        { error: 'unsupported_type', message: 'Please upload an audio file.' },
        { status: 415 },
      );

    const conversation = await findOrCreateConversation(
      bandId,
      localAudioId(),
      fileName,
    );
    try {
      const data = Buffer.from(await file.arrayBuffer());
      await putSongFile({
        conversationId: conversation.id,
        kind: 'audio',
        data,
        fileName,
        mimeType,
      });
    } catch (err) {
      // No re-registration path for a synthetic id, so don't leave an
      // empty conversation behind.
      console.error('[conversations] local audio upload failed', err);
      await deleteConversation(conversation.id).catch(() => {});
      return NextResponse.json(
        { error: 'upload_failed', message: 'Could not store the audio.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ conversation }, { status: 201 });
  }

  const body = await req.json().catch(() => null);
  const driveAudioFileId =
    typeof body?.driveAudioFileId === 'string' ? body.driveAudioFileId.trim() : '';
  const audioFileName =
    typeof body?.audioFileName === 'string' ? body.audioFileName.trim() : null;
  if (!driveAudioFileId)
    return NextResponse.json(
      { error: 'bad_request', message: 'driveAudioFileId is required.' },
      { status: 400 },
    );

  const conversation = await findOrCreateConversation(
    bandId,
    driveAudioFileId,
    audioFileName,
  );

  // Import the audio into Postgres (once). Uses the registrant's token —
  // they just opened the file via the Picker, so they can read it. After
  // this the file is owned by us; playback no longer touches Drive.
  // Re-registering an existing song with no stored audio backfills it.
  if (!(await hasSongFile(conversation.id, 'audio'))) {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'no_token', message: 'Drive access is required to import audio.' },
        { status: 401 },
      );
    }
    try {
      const drive = getDriveClient(session.accessToken);
      const metaRes = await drive.files.get({
        fileId: driveAudioFileId,
        fields: 'name, mimeType, size',
      });
      const declaredSize = Number(metaRes.data.size ?? 0);
      if (declaredSize && declaredSize > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: 'file_too_large', message: 'Audio exceeds the 100 MB limit.' },
          { status: 413 },
        );
      }
      const mediaRes = await drive.files.get(
        { fileId: driveAudioFileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const data = Buffer.from(mediaRes.data as ArrayBuffer);
      if (data.length > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: 'file_too_large', message: 'Audio exceeds the 100 MB limit.' },
          { status: 413 },
        );
      }
      await putSongFile({
        conversationId: conversation.id,
        kind: 'audio',
        data,
        fileName: metaRes.data.name ?? audioFileName ?? 'audio',
        mimeType: metaRes.data.mimeType ?? 'application/octet-stream',
        driveFileId: driveAudioFileId,
      });
    } catch (err) {
      console.error('[conversations] audio import failed', err);
      return NextResponse.json(
        { error: 'import_failed', message: 'Could not import the audio from Drive.' },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ conversation }, { status: 201 });
}
