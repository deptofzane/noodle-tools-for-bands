import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist, setSetlistSongs } from '@/lib/db/setlists';

/**
 * PATCH /api/bands/[bandId]/setlists/[setlistId]
 *   Body: { conversationIds: string[] } — the setlist's songs in their new
 *   order. Must be a subset of the current songs: this reorders and/or
 *   removes (omitted songs are dropped), but doesn't add.
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

  // Reorder/remove only: every submitted id must be a current song, with
  // no duplicates. Omitted songs are removed; new ids are rejected.
  const current = new Set(setlist.songs.map((s) => s.conversationId));
  const validSubset =
    new Set(submitted).size === submitted.length &&
    submitted.every((id) => current.has(id));
  if (!validSubset)
    return NextResponse.json(
      { error: 'bad_order', message: 'Can only reorder or remove existing songs.' },
      { status: 400 },
    );

  await setSetlistSongs(setlistId, submitted);
  return NextResponse.json({ setlist: await getSetlist(setlistId) });
}
