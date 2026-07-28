import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { revokeInvite } from '@/lib/db/invites';

/** DELETE → revoke a pending invite. Owners only. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; inviteId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, inviteId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const ok = await revokeInvite(bandId, inviteId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
