import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { markBandChatRead } from '@/lib/db/band-messages';

/**
 * POST /api/bands/[bandId]/messages/read
 *   → mark the band chat read as of now (clears the unread badge).
 *     Requires band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await markBandChatRead(bandId, user.id);
  return NextResponse.json({ ok: true });
}
