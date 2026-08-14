import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import {
  createAlbum,
  listAlbums,
  listAlbumsWithTracks,
} from '@/lib/db/albums';
import { notify } from '@/lib/db/notifications';
import { parseTracks, pinErrorResponse } from './trackInput';

/**
 * GET  /api/bands/[bandId]/albums
 *   → the band's albums by name, without their tracks. The list view only
 *     needs names; a single album's tracks come from the detail route.
 *
 * POST /api/bands/[bandId]/albums
 *   Body: { name, tracks: [{ conversationId, audioVersionId?|null }] } — in
 *   order. `audioVersionId` null (or absent) means "follow the song's current
 *   default"; naming one pins that version.
 *
 * Both require band membership.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  // `?tracks=1` for the Songs tab's album view, which lists every album's
  // contents at once — fetching them one album at a time would be a request
  // per album for a screen that always wants all of them.
  const withTracks = new URL(req.url).searchParams.get('tracks') === '1';
  return NextResponse.json({
    albums: withTracks
      ? await listAlbumsWithTracks(bandId)
      : await listAlbums(bandId),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const { user } = guard;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 255)
    return NextResponse.json(
      { error: 'bad_name', message: 'Name must be 1–255 characters.' },
      { status: 400 },
    );

  const tracks = await parseTracks(bandId, body?.tracks);
  try {
    const albumId = await createAlbum(bandId, user.id, name, tracks);
    await notify({
      bandId,
      actorId: user.id,
      kind: 'album-created',
      subjectType: 'album',
      subjectId: albumId,
      subjectLabel: name,
    });
    return NextResponse.json({ albumId }, { status: 201 });
  } catch (err) {
    return pinErrorResponse(err);
  }
}
