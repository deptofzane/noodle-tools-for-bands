import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { deleteVenue, getVenue, updateVenue } from '@/lib/db/venues';
import { parseVenueInput } from '@/lib/venues-input';

/**
 * PATCH  /api/bands/[bandId]/venues/[venueId]  → update a venue's fields.
 * DELETE /api/bands/[bandId]/venues/[venueId]  → delete a venue.
 *
 * Both require band membership; the venue must belong to the band.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; venueId: string }> },
) {
  const { bandId, venueId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const venue = await getVenue(venueId);
  if (!venue || venue.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = parseVenueInput(await req.json().catch(() => null));
  if ('error' in parsed)
    return NextResponse.json(
      { error: 'bad_request', message: parsed.error },
      { status: 400 },
    );

  await updateVenue(venueId, parsed.input);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; venueId: string }> },
) {
  const { bandId, venueId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const venue = await getVenue(venueId);
  if (!venue || venue.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await deleteVenue(venueId);
  return new Response(null, { status: 204 });
}
