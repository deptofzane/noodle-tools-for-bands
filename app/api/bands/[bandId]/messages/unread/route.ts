import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getBandChatUnread } from '@/lib/db/band-messages';

/**
 * GET /api/bands/[bandId]/messages/unread
 *   → { count, mentioned } for the current user's view of the band chat.
 *     Requires band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json(await getBandChatUnread(bandId, user.id));
}
