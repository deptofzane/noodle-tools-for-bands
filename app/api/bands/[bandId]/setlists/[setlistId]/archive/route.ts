import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { getSetlist, setSetlistArchived } from '@/lib/db/setlists';

/**
 * POST /api/bands/[bandId]/setlists/[setlistId]/archive
 *   Body: { archived: boolean } — archive or unarchive the setlist. Archived
 *   setlists are hidden from the active list and can't be picked as targets;
 *   the action is reversible. Requires band membership; the setlist must
 *   belong to the band.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string; setlistId: string }> },
) {
  const { bandId, setlistId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.archived !== 'boolean')
    return NextResponse.json(
      { error: 'bad_request', message: 'archived must be a boolean.' },
      { status: 400 },
    );

  await setSetlistArchived(setlistId, body.archived);
  return new NextResponse(null, { status: 204 });
}
