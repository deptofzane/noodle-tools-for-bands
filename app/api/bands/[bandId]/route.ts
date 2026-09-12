import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  deleteBand,
  getBandById,
  getMembership,
  isValidTimezone,
  listMembers,
  renameBand,
  setBandTimezone,
} from '@/lib/db/bands';
import { notify } from '@/lib/db/notifications';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const band = await getBandById(bandId);
  if (!band) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    band,
    members: await listMembers(bandId),
    myRole: membership.role,
  });
}

/**
 * PATCH /api/bands/[bandId]
 *   Body: { name?: string, timezone?: string } → rename the band (≤100 chars)
 *   and/or set the zone its event reminders fire in. Owners only. At least one
 *   field is required; sending neither is a bad request rather than a silent
 *   no-op that still announces "updated" to the band.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const hasName = typeof body?.name === 'string';
  const hasTimezone = typeof body?.timezone === 'string';
  if (!hasName && !hasTimezone)
    return NextResponse.json(
      { error: 'bad_request', message: 'Nothing to update.' },
      { status: 400 },
    );

  const name = hasName ? (body.name as string).trim() : '';
  if (hasName && (!name || name.length > 100))
    return NextResponse.json(
      { error: 'bad_name', message: 'Band name required (≤100 chars).' },
      { status: 400 },
    );

  const timezone = hasTimezone ? (body.timezone as string).trim() : '';
  // An unknown zone wouldn't fail later — it would quietly shift every
  // reminder — so it's rejected here rather than stored.
  if (hasTimezone && !isValidTimezone(timezone))
    return NextResponse.json(
      { error: 'bad_timezone', message: 'Unknown timezone.' },
      { status: 400 },
    );

  let band = hasName
    ? await renameBand(bandId, name)
    : await getBandById(bandId);
  if (hasTimezone) band = await setBandTimezone(bandId, timezone);
  if (!band) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await notify({
    bandId,
    actorId: user.id,
    kind: 'band-updated',
    subjectType: 'band',
    subjectId: bandId,
    subjectLabel: band.name,
  });
  return NextResponse.json({ band });
}

/**
 * DELETE /api/bands/[bandId]
 *   → Permanently delete the band and everything it owns. Owners only.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await deleteBand(bandId);
  return NextResponse.json({ ok: true });
}
