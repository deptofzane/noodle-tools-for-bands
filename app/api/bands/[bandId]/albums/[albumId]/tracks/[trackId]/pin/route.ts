import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { clearTrackPin, getAlbum } from '@/lib/db/albums';

/**
 * DELETE /api/bands/[bandId]/albums/[albumId]/tracks/[trackId]/pin
 *   Drops a track's pinned version so it follows the song's current default.
 *
 * This is the "Use the current default" action on a track whose pinned version
 * was deleted. It exists as its own route rather than going through the
 * album-wide PATCH because that replaces the whole running order — a heavy,
 * lossy way to clear one flag, and one that would need the editor's full state
 * just to resolve a single track from the album view.
 *
 * Requires band membership; the album must belong to the band and the track to
 * the album.
 */
export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ bandId: string; albumId: string; trackId: string }>;
  },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, albumId, trackId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const album = await getAlbum(albumId);
  if (!album || album.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Checked against the album we just authorized, so a track id from another
  // band's album can't be cleared by naming this one.
  if (!album.tracks.some((t) => t.id === trackId))
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await clearTrackPin(trackId);
  return NextResponse.json({ album: await getAlbum(albumId) });
}
