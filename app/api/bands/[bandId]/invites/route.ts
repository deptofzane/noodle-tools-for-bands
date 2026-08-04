import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { createInvite, listPendingInvites } from '@/lib/db/invites';
import { getUserByEmail, normalizeEmail } from '@/lib/db/users';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** GET → pending invites for the band. Owners only. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ invites: await listPendingInvites(bandId) });
}

/**
 * POST { email } → create an invite link for that email. Owners only. The raw
 * token is returned once as a relative `path`; the client builds the full URL.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const email = normalizeEmail(
    typeof body?.email === 'string' ? body.email : '',
  );
  if (!EMAIL_RE.test(email))
    return NextResponse.json(
      { error: 'bad_email', message: 'Enter a valid email address.' },
      { status: 400 },
    );

  // If that email already has an account that's already in the band, there's
  // nothing to invite.
  const existingUser = await getUserByEmail(email);
  if (existingUser && (await getMembership(existingUser.id, bandId)))
    return NextResponse.json(
      { error: 'already_member', message: 'That person is already a member.' },
      { status: 409 },
    );

  const invite = await createInvite({ bandId, email, invitedBy: user.id });
  return NextResponse.json(
    {
      invite: {
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        path: `/invite/${invite.token}`,
      },
    },
    { status: 201 },
  );
}
