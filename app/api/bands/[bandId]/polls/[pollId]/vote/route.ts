import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { allMembersVoted, castVote, closePoll, getPoll } from '@/lib/db/polls';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/polls/[pollId]/vote
 *   Body: { optionId } — cast or change the member's vote. Returns the fresh
 *   tallies (and whether the poll auto-closed). Requires band membership; the
 *   poll must belong to the band.
 *
 * When this vote completes participation — every current member has voted —
 * the poll auto-closes and the band is notified with the results.
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
  if (!ok) return NextResponse.json({ error: 'bad_option' }, { status: 400 });

  // If this vote means everyone has now voted, auto-close the poll and tell
  // the band. Best-effort: a hiccup here must not fail the vote itself.
  let autoClosed = false;
  try {
    if (await allMembersVoted(pollId, bandId)) {
      await closePoll(pollId);
      autoClosed = true;
      await notify({
        bandId,
        actorId: user.id,
        kind: 'poll-auto-closed',
        subjectType: 'poll',
        subjectId: pollId,
        subjectLabel: before.title,
      });
    }
  } catch (err) {
    console.error('[polls] auto-close failed', err);
  }

  const poll = await getPoll(pollId, user.id);
  return NextResponse.json({
    options: poll!.options.map((o) => ({ id: o.id, votes: o.votes })),
    total: poll!.totalVotes,
    myVote: poll!.myVote,
    closed: poll!.closed || autoClosed,
  });
}
