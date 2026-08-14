import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import {
  deleteAlbum,
  getAlbum,
  renameAlbum,
  replaceAlbumTracks,
  setAlbumArchived,
} from '@/lib/db/albums';
import { parseTracks, pinErrorResponse } from '../trackInput';

/**
 * GET    /api/bands/[bandId]/albums/[albumId]
 *   → one album with its tracks in order, each resolved to the version that
 *     will actually play (see `resolveTrack`).
 *
 * PATCH  /api/bands/[bandId]/albums/[albumId]
 *   Body: any of { name, archived, tracks }. `tracks` replaces the running
 *   order wholesale — add, remove, reorder and re-pin are all the same call.
 *
 * DELETE /api/bands/[bandId]/albums/[albumId]
 *   Removes the album and its tracks. The songs themselves are untouched.
 *
 * All require band membership, and the album must belong to the band.
 */
async function guard(bandId: string, albumId: string) {
  const user = await requireUser();
  if (user instanceof NextResponse) return { response: user };
  if (!(await getMembership(user.id, bandId)))
    return {
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };

  const album = await getAlbum(albumId);
  // The same 404 for "gone" and "another band's": membership already passed,
  // so telling them apart would confirm the id exists somewhere.
  if (!album || album.bandId !== bandId)
    return {
      response: NextResponse.json({ error: 'not_found' }, { status: 404 }),
    };
  return { album };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; albumId: string }> },
) {
  const { bandId, albumId } = await params;
  const g = await guard(bandId, albumId);
  if (g.response) return g.response;
  return NextResponse.json({ album: g.album });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; albumId: string }> },
) {
  const { bandId, albumId } = await params;
  const g = await guard(bandId, albumId);
  if (g.response) return g.response;

  const body = await req.json().catch(() => null);

  if (typeof body?.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > 255)
      return NextResponse.json(
        { error: 'bad_name', message: 'Name must be 1–255 characters.' },
        { status: 400 },
      );
    await renameAlbum(albumId, name);
  }

  if (typeof body?.archived === 'boolean') {
    await setAlbumArchived(albumId, body.archived);
  }

  if (Array.isArray(body?.tracks)) {
    try {
      await replaceAlbumTracks(albumId, await parseTracks(bandId, body.tracks));
    } catch (err) {
      return pinErrorResponse(err);
    }
  }

  return NextResponse.json({ album: await getAlbum(albumId) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; albumId: string }> },
) {
  const { bandId, albumId } = await params;
  const g = await guard(bandId, albumId);
  if (g.response) return g.response;
  await deleteAlbum(albumId);
  return new Response(null, { status: 204 });
}
