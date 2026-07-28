import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { acceptInvite } from '@/lib/db/invites';
import { notify } from '@/lib/db/notifications';

/**
 * POST { token } → the signed-in user redeems an invite token, joining the
 * band. Single-use; the token is validated and consumed server-side.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const result = await acceptInvite(token, user.id, user.email);
  switch (result.status) {
    case 'invalid':
      return NextResponse.json(
        { error: 'invalid', message: 'This invite is no longer valid.' },
        { status: 410 },
      );
    case 'expired':
      return NextResponse.json(
        { error: 'expired', message: 'This invite has expired.' },
        { status: 410 },
      );
    case 'email_mismatch':
      return NextResponse.json(
        {
          error: 'email_mismatch',
          message: `This invite is for ${result.email}. Sign in with that email to accept it.`,
        },
        { status: 403 },
      );
    case 'already_member':
      return NextResponse.json(result);
    case 'accepted':
      // Let the band know someone joined (the joiner is excluded from their
      // own feed).
      await notify({
        bandId: result.bandId,
        actorId: user.id,
        kind: 'band-updated',
        subjectType: 'band',
        subjectId: result.bandId,
        subjectLabel: user.name ?? user.email ?? null,
      });
      return NextResponse.json(result);
  }
}
