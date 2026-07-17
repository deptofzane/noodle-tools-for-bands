import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { getEventForUser, removeEventMember } from '@/lib/db/events';

/**
 * DELETE /api/events/[eventId]/members/[userId]
 *   → remove an added member. Only members of the event's owning band.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; userId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { eventId, userId } = await params;

  const event = await getEventForUser(user.id, eventId);
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await getMembership(user.id, event.bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await removeEventMember(eventId, userId);
  return new NextResponse(null, { status: 204 });
}
