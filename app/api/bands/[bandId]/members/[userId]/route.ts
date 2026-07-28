import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership, removeMember, setMemberRole } from '@/lib/db/bands';
import { getUserById } from '@/lib/db/users';
import { notify } from '@/lib/db/notifications';

/**
 * PATCH { role: 'owner' } → promote a member to owner. Owners only. Bands can
 * have multiple owners; promotion is idempotent.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ bandId: string; userId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, userId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (body?.role !== 'owner')
    return NextResponse.json(
      { error: 'bad_role', message: 'Only promotion to owner is supported.' },
      { status: 400 },
    );

  const target = await getMembership(userId, bandId);
  if (!target)
    return NextResponse.json(
      { error: 'not_a_member', message: 'That person isn’t a member of this band.' },
      { status: 404 },
    );

  if (target.role !== 'owner') {
    await setMemberRole(bandId, userId, 'owner');
    const promoted = await getUserById(userId);
    await notify({
      bandId,
      actorId: user.id,
      kind: 'band-updated',
      subjectType: 'band',
      subjectId: bandId,
      subjectLabel: promoted?.name ?? promoted?.email ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ bandId: string; userId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, userId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (userId === user.id)
    return NextResponse.json({ error: 'cannot_remove_self', message: 'Owners can’t remove themselves here.' }, { status: 400 });
  await removeMember(bandId, userId);
  await notify({
    bandId,
    actorId: user.id,
    kind: 'band-updated',
    subjectType: 'band',
    subjectId: bandId,
  });
  return NextResponse.json({ ok: true });
}