import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership, removeMember } from '@/lib/db/bands';

/**
 * POST /api/bands/[bandId]/leave
 *   → The current user leaves the band. Members only — owners can't leave
 *     (they'd orphan the band; transferring/deleting ownership is a
 *     separate, future flow).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;

  const membership = await getMembership(user.id, bandId);
  if (!membership) {
    return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
  }
  if (membership.role === 'owner') {
    return NextResponse.json(
      { error: 'owner_cannot_leave', message: 'Owners can’t leave their own band.' },
      { status: 403 },
    );
  }

  await removeMember(bandId, user.id);
  return NextResponse.json({ ok: true });
}
