import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { deleteEvent, getEventForUser, updateEvent } from '@/lib/db/events';
import { getSetlist } from '@/lib/db/setlists';
import { getVenue } from '@/lib/db/venues';
import { notify } from '@/lib/db/notifications';
import { addHoursToTime, DEFAULT_EVENT_DURATION_HOURS } from '@/lib/format';

/**
 * PATCH /api/events/[eventId]
 *   Body: { title, eventType?, date, time?, endTime?, location?, details?,
 *     setlistId? }
 *   → edit the event. Only members of the owning band. If a start `time` is
 *     given, `endTime` defaults to two hours later. A setlistId, if given, must
 *     belong to that band.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Matches the create route — event kinds are free text, loosely bounded. */
const MAX_EVENT_TYPE = 40;

/** End time only applies with a start; defaults to +2h when not provided. */
function resolveEndTime(time: string | null, rawEnd: string | null): string | null {
  if (!time) return null;
  if (rawEnd && TIME_RE.test(rawEnd)) return rawEnd;
  return addHoursToTime(time, DEFAULT_EVENT_DURATION_HOURS);
}

export async function PATCH(
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
      { error: 'forbidden', message: 'Only band members can edit this event.' },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const date = typeof body?.date === 'string' ? body.date : '';
  const str = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t.length > 0 ? t : null;
  };
  const setlistId = str(body?.setlistId);
  const venueId = str(body?.venueId);

  if (!title || title.length > 255)
    return NextResponse.json(
      { error: 'bad_title', message: 'Title must be 1–255 characters.' },
      { status: 400 },
    );
  if (!DATE_RE.test(date))
    return NextResponse.json(
      { error: 'bad_date', message: 'A valid date is required.' },
      { status: 400 },
    );

  const eventType = str(body?.eventType);
  if (eventType && eventType.length > MAX_EVENT_TYPE)
    return NextResponse.json(
      {
        error: 'bad_event_type',
        message: `Event type must be ${MAX_EVENT_TYPE} characters or fewer.`,
      },
      { status: 400 },
    );

  // A chosen setlist must belong to this event's band.
  if (setlistId) {
    const setlist = await getSetlist(setlistId);
    if (!setlist || setlist.bandId !== event.bandId)
      return NextResponse.json(
        { error: 'bad_setlist', message: 'That setlist isn’t in this band.' },
        { status: 400 },
      );
  }

  // A chosen venue must belong to this event's band.
  if (venueId) {
    const venue = await getVenue(venueId);
    if (!venue || venue.bandId !== event.bandId)
      return NextResponse.json(
        { error: 'bad_venue', message: 'That venue isn’t in this band.' },
        { status: 400 },
      );
  }

  const time = str(body?.time);
  await updateEvent(eventId, {
    title,
    eventType,
    date,
    time,
    endTime: resolveEndTime(time, str(body?.endTime)),
    location: str(body?.location),
    details: str(body?.details),
    notes: str(body?.notes),
    setlistId,
    venueId,
  });
  await notify({
    bandId: event.bandId,
    actorId: user.id,
    kind: 'event-updated',
    subjectType: 'event',
    subjectId: eventId,
    subjectLabel: title,
  });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/events/[eventId] — remove the event (its added-member rows
 * cascade). Only members of the owning band.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { eventId } = await params;

  const event = await getEventForUser(user.id, eventId);
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await getMembership(user.id, event.bandId)))
    return NextResponse.json(
      { error: 'forbidden', message: 'Only band members can delete this event.' },
      { status: 403 },
    );

  await deleteEvent(eventId);
  return new NextResponse(null, { status: 204 });
}
