import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { getConversationById } from '@/lib/db/conversations';
import { addSongToSetlist, getSetlist } from '@/lib/db/setlists';

/**
 * POST /api/bands/[bandId]/setlists/[setlistId]/songs
 *   Body: { conversationId: string } — append a song to the setlist
 *   (idempotent). The song and setlist must both belong to the band.
 *
 * Requires band membership.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string; setlistId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, setlistId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const conversationId =
    typeof body?.conversationId === 'string' ? body.conversationId : '';
  if (!conversationId)
    return NextResponse.json(
      { error: 'bad_request', message: 'conversationId is required.' },
      { status: 400 },
    );

  const conversation = await getConversationById(conversationId);
  if (!conversation || conversation.bandId !== bandId)
    return NextResponse.json(
      { error: 'bad_song', message: 'That song isn’t in this band.' },
      { status: 400 },
    );

  await addSongToSetlist(setlistId, conversationId);
  return NextResponse.json({ ok: true }, { status: 201 });
}
