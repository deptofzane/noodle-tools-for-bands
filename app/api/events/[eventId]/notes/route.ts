import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { getEventBandAndNotes, updateEventNotes } from '@/lib/db/events';

/**
 * The event's private notes, kept separate from the full event PATCH so a
 * quick note doesn't require resending every field. Notes are band-private:
 * both reading and writing require membership of the owning band (an added
 * guest gets 403).
 *
 * GET   /api/events/[eventId]/notes  → { notes }
 * PATCH /api/events/[eventId]/notes  { notes } → { notes }
 */
const MAX_NOTES = 5000;

/** Resolve the event + verify band membership, or return the error response. */
async function guard(
  eventId: string,
): Promise<NextResponse | { bandId: string; notes: string | null }> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const event = await getEventBandAndNotes(eventId);
  if (!event)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await getMembership(user.id, event.bandId)))
    return NextResponse.json(
      { error: 'forbidden', message: 'Only band members can edit these notes.' },
      { status: 403 },
    );
  return event;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const g = await guard(eventId);
  if (g instanceof NextResponse) return g;
  return NextResponse.json({ notes: g.notes });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const g = await guard(eventId);
  if (g instanceof NextResponse) return g;

  const body = await req.json().catch(() => null);
  const raw = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (raw.length > MAX_NOTES)
    return NextResponse.json(
      { error: 'too_long', message: `Notes must be at most ${MAX_NOTES} characters.` },
      { status: 400 },
    );

  const notes = raw.length ? raw : null;
  await updateEventNotes(eventId, notes);
  return NextResponse.json({ notes });
}
