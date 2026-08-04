import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { getUserByEmail } from '@/lib/db/users';
import {
  addEventMember,
  getEventForUser,
  listEventMembers,
} from '@/lib/db/events';

/**
 * GET  /api/events/[eventId]/members  → the event's added members.
 *   Any user who can see the event.
 *
 * POST /api/events/[eventId]/members  Body: { email }
 *   → add a user (who has signed in at least once). Only members of the
 *     event's owning band can add — the same gate as adding to a band.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { eventId } = await params;

  const event = await getEventForUser(user.id, eventId);
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ members: await listEventMembers(eventId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { eventId } = await params;

  const event = await getEventForUser(user.id, eventId);
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await getMembership(user.id, event.bandId)))
    return NextResponse.json(
      { error: 'forbidden', message: 'Only band members can add people.' },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return NextResponse.json({ error: 'bad_email' }, { status: 400 });

  const target = await getUserByEmail(email);
  if (!target)
    return NextResponse.json(
      {
        error: 'user_not_found',
        message:
          'That person must sign in to the app once before they can be added.',
      },
      { status: 404 },
    );

  await addEventMember(eventId, target.id);
  return NextResponse.json({ ok: true }, { status: 201 });
}
