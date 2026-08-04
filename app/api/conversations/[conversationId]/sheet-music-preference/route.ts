import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSheetVersionMeta, setSheetVersionPref } from '@/lib/db/song-files';

/**
 * POST /api/conversations/[conversationId]/sheet-music-preference
 *   Body: { versionId } — remember, for this user, which sheet-music version
 *   they want to view for this song (so it sticks across sessions/devices).
 *   The version must belong to the song. Requires band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const body = await req.json().catch(() => null);
  const versionId = typeof body?.versionId === 'string' ? body.versionId : '';
  if (!versionId || !(await getSheetVersionMeta(conversationId, versionId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await setSheetVersionPref(user.id, conversationId, versionId);
  return NextResponse.json({ ok: true });
}
