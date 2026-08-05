import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { notifyUploadBatch } from '@/lib/db/notifications';
import { readUploadDay } from '@/lib/upload-day';

/**
 * POST /api/bands/[bandId]/conversations/notify-added
 *   Body: { count, day } — folds a bulk import into the band's rollup
 *   notification for today (the per-file adds are done silently), creating it
 *   if this is the day's first upload. Requires band membership.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const { user } = guard;

  const body = await req.json().catch(() => null);
  const count =
    typeof body?.count === 'number' && Number.isFinite(body.count)
      ? Math.floor(body.count)
      : 0;

  if (count > 0)
    await notifyUploadBatch({
      bandId,
      actorId: user.id,
      added: count,
      day: readUploadDay(body?.day),
    });

  return new NextResponse(null, { status: 204 });
}
