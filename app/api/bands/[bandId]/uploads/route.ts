import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { listBandUploads } from '@/lib/db/song-files';

/**
 * GET /api/bands/[bandId]/uploads
 *   → every audio file the band has uploaded, oldest first: first uploads and
 *   later versions alike.
 *
 * Unfiltered by day on purpose. Upload days are the *viewer's* local days, so
 * the client does the grouping (see `dayKey`) — sending a day here would mean
 * also sending an offset for the server to reconstruct the same boundaries.
 * Requires band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ uploads: await listBandUploads(bandId) });
}
