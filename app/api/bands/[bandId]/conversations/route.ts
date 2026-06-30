import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import {
  findOrCreateConversation,
  listBandConversations,
} from '@/lib/db/conversations';
import { hasSongFile, putSongFile } from '@/lib/db/song-files';

// Cap imported audio to keep a single bytea row sane.
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB

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
