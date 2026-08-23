import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { getNoteOwnership, setNotePinned } from '@/lib/db/user-notes';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/notes/[noteId]/pin
 *   Body: { pinned: boolean } → hold the note at the top of its view, or let
 *   it back down. Returns the updated note.
 *
 * Its own route rather than a field on the note's PATCH, because that handler
 * is the author's alone and this deliberately isn't: a shared note belongs to
 * the band's view, so any member may pin or unpin it. There's no cap — the
 * notifications this fires are what keep it accountable.
 *
 * A private note is a different matter: only its author can see it, so only
 * its author can pin it, and a bandmate asking gets the same 404 they'd get
 * for a note that doesn't exist. Saying "forbidden" would confirm it's there.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string; noteId: string }> },
) {
  const { bandId, noteId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const owner = await getNoteOwnership(noteId);
  // Not in this band is a 404 here, not somebody else's note.
  if (!owner || owner.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!owner.shared && owner.authorId !== guard.user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.pinned !== 'boolean')
    return NextResponse.json(
      { error: 'bad_request', message: 'Expected { pinned: boolean }.' },
      { status: 400 },
    );

  const note = await setNotePinned(noteId, bandId, body.pinned);
  if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  /*
   * Only shared notes are announced. A private note is visible to its author
   * alone, so telling the band that someone rearranged a list they can't see
   * would be noise about nothing — and would leak the note's title.
   *
   * Both directions fire. With no cap on pinning, anyone can take down a pin
   * the band was relying on, and the feed is the only thing that makes that
   * visible rather than mysterious.
   *
   * Feed-only; `FEED_ONLY_KINDS` in lib/db/notifications.ts is what keeps it
   * off phones.
   */
  if (note.shared) {
    await notify({
      bandId,
      actorId: guard.user.id,
      kind: body.pinned ? 'note-pinned' : 'note-unpinned',
      subjectType: 'note',
      subjectId: note.id,
      subjectLabel: note.title,
    });
  }

  return NextResponse.json({ note });
}
