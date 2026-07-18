import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { deletePoll, getPoll, updatePoll } from '@/lib/db/polls';
import { notify } from '@/lib/db/notifications';

const MAX_OPTIONS = 20;

/**
 * PATCH /api/bands/[bandId]/polls/[pollId]
 *   Body: { title, description?, options: (string | { id?, text })[] } — edit
 *   the poll. Existing options keep their votes (matched by id); dropped ones
 *   are removed. Requires band membership; the poll must belong to the band.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; pollId: string }> },
) {
  const { bandId, pollId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const existing = await getPoll(pollId);
  if (!existing || existing.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body?.description === 'string' ? body.description.trim() : '';
  const options: { id?: string; text: string }[] = (
    Array.isArray(body?.options) ? body.options : []
  )
    .map((o: unknown) => {
      if (typeof o === 'string') return { text: o.trim() };
      if (o && typeof o === 'object') {
        const rec = o as { id?: unknown; text?: unknown };
        return {
          id: typeof rec.id === 'string' ? rec.id : undefined,
          text: typeof rec.text === 'string' ? rec.text.trim() : '',
        };
      }
      return { text: '' };
    })
    .filter((o: { text: string }) => o.text.length > 0)
    .slice(0, MAX_OPTIONS);

  if (!title || title.length > 255)
    return NextResponse.json(
      { error: 'bad_title', message: 'Title must be 1–255 characters.' },
      { status: 400 },
    );
  if (options.length < 2)
    return NextResponse.json(
      { error: 'too_few_options', message: 'Add at least two options.' },
      { status: 400 },
    );

  // Any change to the title, description, or the option texts (in order)
  // resets the poll's votes — the edited poll is treated as new.
  const existingTexts = existing.options.map((o) => o.text);
  const newTexts = options.map((o) => o.text);
  const changed =
    title !== existing.title ||
    (description || null) !== (existing.description ?? null) ||
    existingTexts.length !== newTexts.length ||
    existingTexts.some((t, i) => t !== newTexts[i]);

  await updatePoll({
    pollId,
    title,
    description: description || null,
    options,
    resetVotes: changed,
  });
  return NextResponse.json({ id: pollId });
}

/**
 * DELETE /api/bands/[bandId]/polls/[pollId] — cancel the poll (deletes it and
 * its votes) and notify the band that it was closed.
 */
export async function DELETE(
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

  await deletePoll(pollId);
  await notify({
    bandId,
    actorId: user.id,
    kind: 'poll-closed',
    subjectType: 'band',
    subjectId: null,
    subjectLabel: existing.title,
  });

  return new NextResponse(null, { status: 204 });
}
