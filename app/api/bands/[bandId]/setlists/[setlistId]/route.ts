import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist, setSetlistOrder } from '@/lib/db/setlists';

/**
 * PATCH /api/bands/[bandId]/setlists/[setlistId]
 *   Body: { conversationIds: string[] } — the setlist's songs in the new
 *   order. Must be a permutation of the current songs (reorder only).
 *
 * Requires band membership; the setlist must belong to the band.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; setlistId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId, setlistId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const submitted: string[] = Array.isArray(body?.conversationIds)
    ? body.conversationIds.filter((v: unknown): v is string => typeof v === 'string')
    : [];

  // Reorder only: the submitted ids must be exactly the current songs.
  const current = setlist.songs.map((s) => s.conversationId);
  const sameSet =
    submitted.length === current.length &&
    new Set(submitted).size === current.length &&
    submitted.every((id) => current.includes(id));
  if (!sameSet)
    return NextResponse.json(
      { error: 'bad_order', message: 'Must reorder the existing songs.' },
      { status: 400 },
    );

  await setSetlistOrder(setlistId, submitted);
  return NextResponse.json({ setlist: await getSetlist(setlistId) });
}
