import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { castVote, getPoll } from '@/lib/db/polls';

/**
 * POST /api/bands/[bandId]/polls/[pollId]/vote
 *   Body: { optionId } — cast or change the member's vote. Returns the fresh
 *   tallies. Requires band membership; the poll must belong to the band.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string; pollId: string }> },
) {
  const { bandId, pollId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const { user } = guard;

  const before = await getPoll(pollId);
  if (!before || before.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (before.closed)
    return NextResponse.json(
      { error: 'poll_closed', message: 'This poll is closed.' },
      { status: 409 },
    );

  const body = await req.json().catch(() => null);
  const optionId = typeof body?.optionId === 'string' ? body.optionId : '';
  const ok = await castVote({ pollId, optionId, userId: user.id });
  if (!ok)
    return NextResponse.json({ error: 'bad_option' }, { status: 400 });

  const poll = await getPoll(pollId, user.id);
  return NextResponse.json({
    options: poll!.options.map((o) => ({ id: o.id, votes: o.votes })),
    total: poll!.totalVotes,
    myVote: poll!.myVote,
  });
}
