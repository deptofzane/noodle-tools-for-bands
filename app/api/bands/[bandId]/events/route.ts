import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { listBandEvents } from '@/lib/db/events';

/**
 * GET /api/bands/[bandId]/events
 *   → the band's events ("shows"), newest first. Requires band membership.
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
  return NextResponse.json({ events: await listBandEvents(bandId) });
}
