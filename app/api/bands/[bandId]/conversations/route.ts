import { randomUUID } from 'node:crypto';
import { requireBandMember } from '@/lib/api-guard';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import {
  deleteConversation,
  findOrCreateConversation,
  listBandConversations,
} from '@/lib/db/conversations';
import { notify } from '@/lib/db/notifications';
import type { Readable } from 'node:stream';
import { addAudioVersion, hasSongFile } from '@/lib/db/song-files';
import { MAX_AUDIO_BYTES, normalizeAudioMime } from '@/lib/audio-mime';
import { fileToNodeStream, uploadLimit } from '@/lib/upload-limit';
import { fetchDropboxFile } from '@/lib/dropbox';

// Local audio has no Drive id; mint a synthetic one so the conversation's
// (band, drive_audio_file_id) key stays satisfied. Playback reads from
// object storage, so nothing resolves this value against Drive.
function localAudioId(): string {
  return `local-${randomUUID()}`;
}

/**
 * GET  /api/bands/[bandId]/conversations
 *   → conversations (registered audio) in the band, newest activity first.
 *
 * POST /api/bands/[bandId]/conversations
 *   Body: { driveAudioFileId: string, audioFileName?: string }
 *   → registers a Drive audio file under the band (find-or-create).
 *   Also accepts a multipart `file` (local upload), JSON { dropboxUrl, name? }
 *   (Dropbox import), or JSON { name } (create a song with no audio yet).
 *
 * Both require band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ conversations: await listBandConversations(bandId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const { user } = guard;
  // Bulk imports (Drive picker) pass ?silent=1 and send one batched
  // notification afterwards instead of one per file.
  const silent = new URL(req.url).searchParams.get('silent') === '1';

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
        { error: 'file_too_large', message: 'Audio exceeds the 50 MB limit.' },
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
      await uploadLimit.run(() =>
        addAudioVersion({
          conversationId: conversation.id,
          body: fileToNodeStream(file),
          sizeBytes: file.size,
          fileName,
          mimeType,
        }),
      );
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
    if (!silent) {
      await notify({
        bandId,
        actorId: user.id,
        kind: 'audio-added',
        subjectType: 'conversation',
        subjectId: conversation.id,
        subjectLabel: conversation.audioFileName ?? fileName,
      });
    }
    return NextResponse.json({ conversation }, { status: 201 });
  }

  const body = await req.json().catch(() => null);

  // Dropbox import: JSON { dropboxUrl, name?, bytes? }. Like a local upload
  // (synthetic conversation id), but the server streams the file straight from
  // Dropbox's direct link — no OAuth, no Drive round-trip.
  const dropboxUrl = typeof body?.dropboxUrl === 'string' ? body.dropboxUrl : '';
  if (dropboxUrl) {
    const name =
      typeof body?.name === 'string' && body.name.trim()
        ? body.name.trim()
        : 'audio';
    const clientBytes = Number(body?.bytes ?? 0) || 0;
    if (clientBytes > MAX_AUDIO_BYTES)
      return NextResponse.json(
        { error: 'file_too_large', message: 'Audio exceeds the 50 MB limit.' },
        { status: 413 },
      );

    const fetched = await fetchDropboxFile(dropboxUrl);
    if (!fetched)
      return NextResponse.json(
        { error: 'bad_source', message: 'Could not download from Dropbox.' },
        { status: 400 },
      );
    const mimeType = normalizeAudioMime(fetched.contentType, name);
    if (!mimeType) {
      fetched.body.destroy();
      return NextResponse.json(
        { error: 'unsupported_type', message: 'Please choose an audio file.' },
        { status: 415 },
      );
    }
    if (!fetched.sizeBytes) {
      fetched.body.destroy();
      return NextResponse.json(
        { error: 'import_failed', message: 'Could not determine the file size.' },
        { status: 502 },
      );
    }
    if (fetched.sizeBytes > MAX_AUDIO_BYTES) {
      fetched.body.destroy();
      return NextResponse.json(
        { error: 'file_too_large', message: 'Audio exceeds the 50 MB limit.' },
        { status: 413 },
      );
    }

    const conversation = await findOrCreateConversation(
      bandId,
      localAudioId(),
      name,
    );
    try {
      await uploadLimit.run(() =>
        addAudioVersion({
          conversationId: conversation.id,
          body: fetched.body,
          sizeBytes: fetched.sizeBytes,
          fileName: name,
          mimeType,
        }),
      );
    } catch (err) {
      console.error('[conversations] Dropbox audio import failed', err);
      await deleteConversation(conversation.id).catch(() => {});
      return NextResponse.json(
        { error: 'upload_failed', message: 'Could not store the audio.' },
        { status: 502 },
      );
    }
    if (!silent) {
      await notify({
        bandId,
        actorId: user.id,
        kind: 'audio-added',
        subjectType: 'conversation',
        subjectId: conversation.id,
        subjectLabel: conversation.audioFileName ?? name,
      });
    }
    return NextResponse.json({ conversation }, { status: 201 });
  }

  // Create a song with no audio yet: JSON { name }. Mints a synthetic
  // conversation id (like a local upload) but stores no audio, so members can
  // start a song from just a name and add audio, sheet music, notes, or drop
  // it into a setlist later.
  const songName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (songName) {
    const conversation = await findOrCreateConversation(
      bandId,
      localAudioId(),
      songName,
    );
    if (!silent) {
      await notify({
        bandId,
        actorId: user.id,
        kind: 'song-created',
        subjectType: 'conversation',
        subjectId: conversation.id,
        subjectLabel: conversation.audioFileName ?? songName,
      });
    }
    return NextResponse.json({ conversation }, { status: 201 });
  }

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
  let addedAudio = false;
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
        { fileId: driveAudioFileId, alt: 'media' },
        { responseType: 'stream' },
      );
      await uploadLimit.run(() =>
        addAudioVersion({
          conversationId: conversation.id,
          body: mediaRes.data as unknown as Readable,
          sizeBytes: declaredSize,
          fileName: metaRes.data.name ?? audioFileName ?? 'audio',
          mimeType: metaRes.data.mimeType ?? 'application/octet-stream',
          driveFileId: driveAudioFileId,
        }),
      );
      addedAudio = true;
    } catch (err) {
      console.error('[conversations] audio import failed', err);
      return NextResponse.json(
        { error: 'import_failed', message: 'Could not import the audio from Drive.' },
        { status: 502 },
      );
    }
  }

  if (addedAudio && !silent) {
    await notify({
      bandId,
      actorId: user.id,
      kind: 'audio-added',
      subjectType: 'conversation',
      subjectId: conversation.id,
      subjectLabel: conversation.audioFileName ?? audioFileName,
    });
  }

  return NextResponse.json({ conversation }, { status: 201 });
}
