import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { listBandEvents } from '@/lib/db/events';

/**
 * GET /api/bands/[bandId]/events
 *   → the band's events ("shows"), newest first. Requires band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ events: await listBandEvents(bandId) });
}
