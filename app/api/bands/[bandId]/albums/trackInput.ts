import { NextResponse } from 'next/server';
import { listBandConversations } from '@/lib/db/conversations';
import { AlbumPinError, type AlbumTrackInput } from '@/lib/db/albums';

/**
 * Request parsing shared by the album routes.
 *
 * A separate module rather than exports from `route.ts`: Next only permits
 * route handlers and a fixed set of config values to be exported from one, and
 * anything else fails the build with "does not match the required types of a
 * Next.js Route".
 */

/**
 * Normalize a request's tracks, dropping anything that isn't one of this
 * band's unarchived songs.
 *
 * Duplicates are kept, unlike setlists: a song may sit on an album more than
 * once, which is the point of pinning different takes.
 */
export async function parseTracks(
  bandId: string,
  raw: unknown,
): Promise<AlbumTrackInput[]> {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(
    (await listBandConversations(bandId))
      .filter((c) => !c.archived)
      .map((c) => c.id),
  );
  const out: AlbumTrackInput[] = [];
  for (const entry of raw) {
    const it = entry as { conversationId?: unknown; audioVersionId?: unknown };
    const cid = typeof it?.conversationId === 'string' ? it.conversationId : '';
    if (!allowed.has(cid)) continue;
    out.push({
      conversationId: cid,
      audioVersionId:
        typeof it?.audioVersionId === 'string' ? it.audioVersionId : null,
    });
  }
  return out;
}

/**
 * A pin naming another song's audio is the caller's mistake, not a server
 * fault — the data layer throws rather than silently dropping it, because a
 * pin that vanishes on save looks like a bug in the editor.
 */
export function pinErrorResponse(err: unknown): NextResponse {
  if (err instanceof AlbumPinError)
    return NextResponse.json(
      {
        error: 'bad_version',
        message: 'That audio version belongs to a different song.',
      },
      { status: 400 },
    );
  throw err;
}
