import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { shareFileWithServiceAccount } from '@/lib/drive-service';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import {
  findOrCreateConversation,
  listBandConversations,
} from '@/lib/db/conversations';

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

  // Best-effort: share the file with the service account so every band
  // member can stream it regardless of their personal Drive access. Uses
  // the registrant's token (they can access the Picker-opened file). A
  // no-op when no service account is configured; failures fall back to
  // personal-token streaming.
  const session = await auth();
  if (session?.accessToken) {
    await shareFileWithServiceAccount(
      getDriveClient(session.accessToken),
      driveAudioFileId,
    );
  }

  return NextResponse.json({ conversation }, { status: 201 });
}
