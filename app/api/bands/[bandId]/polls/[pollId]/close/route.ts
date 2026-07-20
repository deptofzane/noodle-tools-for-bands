import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { closePoll, getPoll } from '@/lib/db/polls';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/polls/[pollId]/close — close the poll (stop voting,
 * keep it for history) and notify the band, linking to the results. Requires
 * band membership; the poll must belong to the band. Idempotent if already
 * closed. Any band member may close a poll.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; pollId: string }> },
) {
  const { bandId, pollId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const { user } = guard;

  const existing = await getPoll(pollId);
  if (!existing || existing.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (!existing.closed) {
    await closePoll(pollId);
    await notify({
      bandId,
      actorId: user.id,
      kind: 'poll-closed',
      subjectType: 'poll',
      subjectId: pollId,
      subjectLabel: existing.title,
    });
  }

  return new NextResponse(null, { status: 204 });
}
