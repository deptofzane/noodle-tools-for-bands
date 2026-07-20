import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/conversations/notify-added
 *   Body: { count } — one batched "added N songs" notification for a bulk
 *   import (the per-file adds are done silently). Requires band membership.
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

  if (count > 0) {
    await notify({
      bandId,
      actorId: user.id,
      kind: 'audio-added',
      subjectType: 'conversation',
      subjectId: null,
      subjectLabel: `${count} ${count === 1 ? 'song' : 'songs'}`,
    });
  }

  return new NextResponse(null, { status: 204 });
}
