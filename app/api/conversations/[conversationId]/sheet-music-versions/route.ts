import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  getSheetVersionPref,
  listSheetVersions,
  resolvePreferredSheetVersionId,
} from '@/lib/db/song-files';

/**
 * GET /api/conversations/[conversationId]/sheet-music-versions
 *   → { versions, preferredId } — the song's sheet-music versions (default
 *     first) and the id this user should view (their saved preference if it
 *     still exists, else the default). Adding a version is done via
 *     `POST /files/sheet_music`. Requires band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { conversationId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [versions, pref] = await Promise.all([
    listSheetVersions(conversationId),
    getSheetVersionPref(user.id, conversationId),
  ]);
  return NextResponse.json({
    versions,
    preferredId: resolvePreferredSheetVersionId(versions, pref),
  });
}
