import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { createVenue, listBandVenues } from '@/lib/db/venues';
import { parseVenueInput } from '@/lib/venues-input';

/**
 * GET  /api/bands/[bandId]/venues
 *   → the band's saved venues (alphabetical).
 *
 * POST /api/bands/[bandId]/venues
 *   Body: { name, address?, phone?, email?, contactName?, notes? } → create.
 *
 * Both require band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ venues: await listBandVenues(bandId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const { user } = guard;

  const parsed = parseVenueInput(await req.json().catch(() => null));
  if ('error' in parsed)
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error },
      { status: 400 },
    );

  const venue = await createVenue({
    bandId,
    createdBy: user.id,
    fields: parsed.input,
  });
  return NextResponse.json({ venue }, { status: 201 });
}
