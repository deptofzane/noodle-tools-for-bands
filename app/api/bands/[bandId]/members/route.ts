import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { addMember, getMembership } from '@/lib/db/bands';
import { getUserByEmail } from '@/lib/db/users';

export async function POST(req: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
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
  return NextResponse.json({ ok: true }, { status: 201 });
}