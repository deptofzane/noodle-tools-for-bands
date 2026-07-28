import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { addMember, getMembership, listMembers } from '@/lib/db/bands';
import { getUserByEmail } from '@/lib/db/users';
import { notify } from '@/lib/db/notifications';

/** GET → the band's members (any member may view; used by the leave/transfer flow). */
export async function GET(_req: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ members: await listMembers(bandId) });
}

export async function POST(req: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden', message: 'Only owners can add members.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return NextResponse.json({ error: 'bad_email' }, { status: 400 });

  const target = await getUserByEmail(email);
  if (!target)
    return NextResponse.json(
      { error: 'user_not_found', message: 'That person must sign in to the app once before they can be added.' },
      { status: 404 },
    );

  await addMember(bandId, target.id, 'member');
  await notify({
    bandId,
    actorId: user.id,
    kind: 'band-updated',
    subjectType: 'band',
    subjectId: bandId,
    subjectLabel: target.name ?? target.email,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}