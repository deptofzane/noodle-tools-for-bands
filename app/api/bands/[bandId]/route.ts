import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  deleteBand,
  getBandById,
  getMembership,
  listMembers,
  renameBand,
} from '@/lib/db/bands';
import { notify } from '@/lib/db/notifications';

export async function GET(_req: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const band = await getBandById(bandId);
  if (!band) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ band, members: await listMembers(bandId), myRole: membership.role });
}

/**
 * PATCH /api/bands/[bandId]
 *   Body: { name: string } → rename the band (≤100 chars). Owners only.
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
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100)
    return NextResponse.json(
      { error: 'bad_name', message: 'Band name required (≤100 chars).' },
      { status: 400 },
    );

  const band = await renameBand(bandId, name);
  if (!band) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await notify({
    bandId,
    actorId: user.id,
    kind: 'band-updated',
    subjectType: 'band',
    subjectId: bandId,
    subjectLabel: name,
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