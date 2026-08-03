import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { getSetlist, getSetlistPracticeSongs } from '@/lib/db/setlists';

/**
 * GET /api/setlists/[setlistId]/practice-songs
 *   → { setlist: { id, name, bandId }, songs } — the setlist's items in order,
 *   with the audio and sheet-music metadata Practice and Live need.
 *
 * Keyed on the setlist alone: those screens are reached by setlist id (see
 * lib/routes.ts) and the band is derived from it, which is also where the
 * membership check comes from. This is the only guard on that content — the
 * screens themselves are public shells with nothing in them.
 *
 * A non-member gets 403 rather than 404: the id in the URL is a UUID someone
 * shared with them, so "you don't have access" is the honest answer and the
 * one the screens show.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ setlistId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { setlistId } = await params;

  const setlist = await getSetlist(setlistId);
  if (!setlist)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!(await getMembership(user.id, setlist.bandId)))
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'You’re not a member of the band this setlist belongs to.',
      },
      { status: 403 },
    );

  return NextResponse.json({
    setlist: { id: setlist.id, name: setlist.name, bandId: setlist.bandId },
    songs: await getSetlistPracticeSongs(setlistId),
  });
}
