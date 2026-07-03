import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { listBandConversations } from '@/lib/db/conversations';
import { getSetlist, setSetlistSongs } from '@/lib/db/setlists';

/**
 * PATCH /api/bands/[bandId]/setlists/[setlistId]
 *   Body: { conversationIds: string[] } — the setlist's songs in their new
 *   order. Sets the setlist to exactly these songs (add / remove / reorder).
 *   Every id must be a song in the band, with no duplicates.
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

  // Every submitted id must be a song in this band, with no duplicates.
  // (Songs can be added, removed, or reordered — but only band songs.)
  const bandSongs = new Set(
    (await listBandConversations(bandId)).map((c) => c.id),
  );
  const valid =
    new Set(submitted).size === submitted.length &&
    submitted.every((id) => bandSongs.has(id));
  if (!valid)
    return NextResponse.json(
      { error: 'bad_songs', message: 'Songs must belong to this band.' },
      { status: 400 },
    );

  await setSetlistSongs(setlistId, submitted);
  return NextResponse.json({ setlist: await getSetlist(setlistId) });
}
