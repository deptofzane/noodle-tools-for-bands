import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { getConversationMembership } from '@/lib/db/conversations';
import type { Readable } from 'node:stream';
import { addAudioVersion, listAudioVersions } from '@/lib/db/song-files';
import { MAX_AUDIO_BYTES, normalizeAudioMime } from '@/lib/audio-mime';
import { fileToNodeStream, uploadLimit } from '@/lib/upload-limit';

/**
 * Audio versions for a song (conversation).
 *
 *   GET  → list every version (default first)
 *   POST → add a new version, from a local upload (multipart `file`) or a
 *          Drive import (JSON `{ driveFileId }`). Optional `label`.
 *
 * A song's first audio version is automatically its default; added
 * versions are not. Both require band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { conversationId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ versions: await listAudioVersions(conversationId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { conversationId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  // Drive import: JSON { driveFileId, label? }.
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => null);
    const driveFileId =
      typeof body?.driveFileId === 'string' ? body.driveFileId.trim() : '';
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    if (!driveFileId) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json(
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
      const declaredSize = Number(metaRes.data.size ?? 0);
      if (declaredSize > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: 'file_too_large', message: 'Audio exceeds the 50 MB limit.' },
          { status: 413 },
        );
      }
      if (!declaredSize) {
        return NextResponse.json(
          { error: 'import_failed', message: 'Could not determine the file size.' },
          { status: 502 },
        );
      }
      const mediaRes = await drive.files.get(
        { fileId: driveFileId, alt: 'media' },
        { responseType: 'stream' },
      );
      const version = await uploadLimit.run(() =>
        addAudioVersion({
          conversationId,
          body: mediaRes.data as unknown as Readable,
          sizeBytes: declaredSize,
          fileName: metaRes.data.name ?? 'audio',
          mimeType: metaRes.data.mimeType ?? 'application/octet-stream',
          label: label || null,
          driveFileId,
        }),
      );
      return NextResponse.json({ version }, { status: 201 });
    } catch (err) {
      console.error('[audio-versions] Drive import failed', err);
      return NextResponse.json(
        { error: 'import_failed', message: 'Could not import the audio from Drive.' },
        { status: 502 },
      );
    }
  }

  // Local upload: multipart `file` (+ optional `label`).
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const label =
    typeof form?.get('label') === 'string' ? String(form.get('label')).trim() : '';
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: 'no_file', message: 'An audio file is required.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: 'file_too_large', message: 'Audio exceeds the 50 MB limit.' },
      { status: 413 },
    );
  }
  const fileName = file.name || 'audio';
  const mimeType = normalizeAudioMime(file.type, fileName);
  if (!mimeType) {
    return NextResponse.json(
      { error: 'unsupported_type', message: 'Please upload an audio file.' },
      { status: 415 },
    );
  }
  try {
    const version = await uploadLimit.run(() =>
      addAudioVersion({
        conversationId,
        body: fileToNodeStream(file),
        sizeBytes: file.size,
        fileName,
        mimeType,
        label: label || null,
      }),
    );
    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    console.error('[audio-versions] local upload failed', err);
    return NextResponse.json(
      { error: 'upload_failed', message: 'Could not store the audio.' },
      { status: 502 },
    );
  }
}
