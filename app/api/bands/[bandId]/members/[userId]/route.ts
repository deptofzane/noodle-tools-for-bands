import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership, removeMember } from '@/lib/db/bands';
import { notify } from '@/lib/db/notifications';

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