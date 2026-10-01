import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { getBandById } from '@/lib/db/bands';
import { listPracticePicker } from '@/lib/db/practice-picker';

/**
 * GET /api/bands/[bandId]/practice-picker
 *   → { songs, setlists, events } for the Practice screen's "Select" picker:
 *   active songs, setlists with songs, and upcoming events whose setlist has
 *   songs. Requires band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const band = await getBandById(bandId);
  if (!band) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // "Upcoming" is from the band's today, not the server's: a show tonight in
  // Denver mustn't drop off the list at 6pm because the server runs on UTC.
  // en-CA formats as YYYY-MM-DD, the shape event dates are stored in.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: band.timezone,
  }).format(new Date());

  return NextResponse.json(await listPracticePicker(bandId, today));
}
