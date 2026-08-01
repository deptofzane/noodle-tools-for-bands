import { NextResponse } from 'next/server';
import { requireConversationMember } from '@/lib/api-guard';
import { listBandSetlistNames } from '@/lib/db/setlists';

/**
 * GET /api/conversations/[conversationId]/setlists
 *   → { bandId, setlists: [{ id, name }] } — the active setlists of the band
 *   this song belongs to, i.e. the ones it could be added to. For callers that
 *   hold a song but not its band (the global player's queue); adding is still
 *   POST /api/bands/[bandId]/setlists/[setlistId]/songs.
 *
 * Requires membership of the song's band.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const guard = await requireConversationMember(conversationId);
  if (guard instanceof NextResponse) return guard;

  const { bandId } = guard.membership.conversation;
  return NextResponse.json({
    bandId,
    setlists: await listBandSetlistNames(bandId),
  });
}
