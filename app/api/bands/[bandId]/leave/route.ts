import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { leaveBand } from '@/lib/db/bands';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/leave
 *   Body (owners): { newOwnerId: string } — the member to hand ownership to.
 *   → The current user leaves the band. A plain member is removed. An owner
 *     must name a successor (another member); a sole owner can't leave (409)
 *     and is told to delete the band instead.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId } = await params;
  const body = await req.json().catch(() => null);
  const newOwnerId =
    typeof body?.newOwnerId === 'string' ? body.newOwnerId : undefined;

  const result = await leaveBand(user.id, bandId, newOwnerId);
  switch (result.status) {
    case 'not_a_member':
      return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
    case 'sole_owner':
      return NextResponse.json(
        {
          error: 'sole_owner',
          message:
            'You’re the only member. Delete the band from its Edit page instead.',
        },
        { status: 409 },
      );
    case 'needs_new_owner':
      return NextResponse.json(
        {
          error: 'needs_new_owner',
          message: 'Choose a member to become the new owner.',
        },
        { status: 400 },
      );
    case 'invalid_new_owner':
      return NextResponse.json(
        {
          error: 'invalid_new_owner',
          message: 'That person isn’t a member of this band.',
        },
        { status: 400 },
      );
    case 'left':
    case 'transferred':
      // Let remaining members (especially the new owner) know the roster
      // changed. The leaver is already gone, so they won't see this.
      await notify({
        bandId,
        actorId: user.id,
        kind: 'band-updated',
        subjectType: 'band',
        subjectId: bandId,
      });
      return NextResponse.json({ ok: true, ...result });
  }
}
