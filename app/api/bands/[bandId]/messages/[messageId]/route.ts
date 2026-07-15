import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { deleteBandMessage } from '@/lib/db/band-messages';

/**
 * DELETE /api/bands/[bandId]/messages/[messageId]
 *   → soft-delete a message. Allowed for the author, or a band owner.
 *     Requires band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; messageId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId, messageId } = await params;

  const membership = await getMembership(user.id, bandId);
  if (!membership) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const deleted = await deleteBandMessage(
    bandId,
    messageId,
    user.id,
    membership.role === 'owner',
  );
  if (!deleted) {
    // Either the message doesn't exist, is already gone, or isn't the
    // caller's to delete — don't distinguish.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
