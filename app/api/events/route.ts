import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { createEvent, listEventsForUserInRange } from '@/lib/db/events';
import { getSetlist } from '@/lib/db/setlists';
import { notify } from '@/lib/db/notifications';
import { addHoursToTime, DEFAULT_EVENT_DURATION_HOURS } from '@/lib/format';

const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Resolve an event's end time: only meaningful with a start; a valid provided
 * end wins, otherwise it defaults to `DEFAULT_EVENT_DURATION_HOURS` after the
 * start. Null for all-day (no start) events.
 */
function resolveEndTime(time: string | null, rawEnd: string | null): string | null {
  if (!time) return null;
  if (rawEnd && TIME_RE.test(rawEnd)) return rawEnd;
  return addHoursToTime(time, DEFAULT_EVENT_DURATION_HOURS);
}

/**
 * GET  /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → events visible to the user (their bands' + ones they're added to)
 *     with a date in the range.
 *
 * POST /api/events
 *   Body: { bandId, title, date, time?, endTime?, location?, details?,
 *     setlistId? } → create an event owned by a band the user belongs to. If a
 *     start `time` is given, `endTime` defaults to two hours later. A setlistId,
 *     if given, must belong to that band.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to))
    return NextResponse.json(
      { error: 'bad_range', message: 'from and to must be YYYY-MM-DD.' },
      { status: 400 },
    );

  return NextResponse.json({
    events: await listEventsForUserInRange(user.id, from, to),
  });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const bandId = typeof body?.bandId === 'string' ? body.bandId : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const date = typeof body?.date === 'string' ? body.date : '';
  const str = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t.length > 0 ? t : null;
  };

  if (!bandId)
    return NextResponse.json(
      { error: 'bad_band', message: 'A band is required.' },
      { status: 400 },
    );
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

  // You can only create events under a band you belong to.
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json(
      { error: 'forbidden', message: 'You’re not a member of that band.' },
      { status: 403 },
    );

  // A chosen setlist must belong to that band.
  const setlistId = str(body?.setlistId);
  if (setlistId) {
    const setlist = await getSetlist(setlistId);
    if (!setlist || setlist.bandId !== bandId)
      return NextResponse.json(
        { error: 'bad_setlist', message: 'That setlist isn’t in this band.' },
        { status: 400 },
      );
  }

  const time = str(body?.time);
  const { id } = await createEvent({
    bandId,
    title,
    date,
    time,
    endTime: resolveEndTime(time, str(body?.endTime)),
    location: str(body?.location),
    details: str(body?.details),
    setlistId,
    createdBy: user.id,
  });
  await notify({
    bandId,
    actorId: user.id,
    kind: 'event-added',
    subjectType: 'event',
    subjectId: id,
    subjectLabel: title,
  });
  return NextResponse.json({ id }, { status: 201 });
}
