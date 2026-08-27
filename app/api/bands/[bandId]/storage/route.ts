import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { bandStorageUsage } from '@/lib/db/song-files';

/**
 * GET /api/bands/[bandId]/storage → { usage: { bytes, files } }
 *
 * The total on its own. The upload surfaces only need the number to decide
 * whether to warn, and listing every file to add up sizes they'd throw away
 * would be a much larger answer to a much smaller question.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  return NextResponse.json({ usage: await bandStorageUsage(bandId) });
}
