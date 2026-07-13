import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  deleteAudioVersion,
  setDefaultAudioVersion,
} from '@/lib/db/song-files';

/**
 * A single audio version.
 *
 *   PATCH { default: true } → make this the song's default version
 *   DELETE                  → remove this version (promotes the newest
 *                             remaining version to default if this was it)
 *
 * Both require band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ conversationId: string; versionId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, versionId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (body?.default !== true) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Only { default: true } is supported.' },
      { status: 400 },
    );
  }

  const ok = await setDefaultAudioVersion(conversationId, versionId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ conversationId: string; versionId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, versionId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await deleteAudioVersion(conversationId, versionId);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, newDefaultId: result.newDefaultId });
}
