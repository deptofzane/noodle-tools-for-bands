import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { createPoll, listBandPolls } from '@/lib/db/polls';
import { notify } from '@/lib/db/notifications';

const MAX_OPTIONS = 20;

/** GET /api/bands/[bandId]/polls → the band's polls (newest first). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ polls: await listBandPolls(bandId) });
}

/**
 * POST /api/bands/[bandId]/polls
 *   Body: { title, description?, options: string[] } — create a poll (>= 2
 *   non-empty options) and notify the band. Requires band membership.
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
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body?.description === 'string' ? body.description.trim() : '';
  const options: string[] = (Array.isArray(body?.options) ? body.options : [])
    .map((o: unknown) => (typeof o === 'string' ? o.trim() : ''))
    .filter((o: string) => o.length > 0)
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

  const poll = await createPoll({
    bandId,
    createdBy: user.id,
    title,
    description: description || null,
    options,
  });

  await notify({
    bandId,
    actorId: user.id,
    kind: 'poll-created',
    subjectType: 'poll',
    subjectId: poll.id,
    subjectLabel: poll.title,
  });

  return NextResponse.json({ id: poll.id }, { status: 201 });
}
