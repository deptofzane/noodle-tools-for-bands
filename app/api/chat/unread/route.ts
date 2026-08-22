import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getChatUnreadForUser } from '@/lib/db/band-messages';

/**
 * GET /api/chat/unread
 *   → { count, mentioned, byBand } for the signed-in user, across every band
 *     they belong to. Drives the nav badge, which is global and so can't be
 *     answered by any one band's endpoint.
 *
 * Membership is enforced inside the query (it joins through band_members), so
 * this needs no band guard of its own — there is no band parameter to abuse.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await getChatUnreadForUser(user.id));
}
