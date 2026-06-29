import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership, removeMember } from '@/lib/db/bands';

export async function DELETE(_req: Request, { params }: { params: Promise<{ bandId: string; userId: string }> }) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId, userId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (userId === user.id)
    return NextResponse.json({ error: 'cannot_remove_self', message: 'Owners can’t remove themselves here.' }, { status: 400 });
  await removeMember(bandId, userId);
  return NextResponse.json({ ok: true });
}