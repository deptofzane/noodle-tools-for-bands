import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { listBandUploads } from '@/lib/db/song-files';
import { readWindow, splitPage } from '@/lib/paging';

/**
 * GET /api/bands/[bandId]/uploads[?limit=&offset=]
 *   → one page of the band's audio files, newest first, with `hasMore`.
 *
 * GET /api/bands/[bandId]/uploads?from=<iso>&to=<iso>
 *   → every upload in that window instead, unpaged (a day is bounded).
 *
 * Not filtered by day here. Upload days are the *viewer's* local days, so a
 * day key means nothing without the offset it was made in — the browser turns
 * the day it wants into the two instants above, which mean the same thing on
 * both sides. Requires band membership.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const url = new URL(req.url);
  const from = parseInstant(url.searchParams.get('from'));
  const to = parseInstant(url.searchParams.get('to'));

  if (from || to) {
    // A malformed bound would silently widen the window to everything, which
    // is the unbounded read this endpoint exists to avoid.
    if (!from || !to) {
      return NextResponse.json({ error: 'bad_window' }, { status: 400 });
    }
    const uploads = await listBandUploads(bandId, { from, to });
    return NextResponse.json({ uploads, hasMore: false });
  }

  // One page at a time, with one row over the edge so `hasMore` is free.
  const { limit, offset } = readWindow(url);
  const rows = await listBandUploads(bandId, { limit: limit + 1, offset });
  const { items, hasMore } = splitPage(rows, limit);
  return NextResponse.json({ uploads: items, hasMore });
}

function parseInstant(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
