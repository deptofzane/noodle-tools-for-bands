import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import {
  deleteNote,
  getNoteForUser,
  getNoteOwnership,
  updateNote,
} from '@/lib/db/user-notes';
import { parseLinks } from '@/lib/note-links';

const MAX_TITLE = 200;
const MAX_BODY = 20_000;

/**
 * GET    /api/bands/[bandId]/notes/[noteId]  → read it (author, or shared)
 * PATCH  …  Body: { title, body?, shared?, links? } → overwrite it
 * DELETE …  → remove it (its links cascade)
 *
 * All require band membership. Reading also requires the note to be yours or
 * shared; writing and deleting are the author's alone — sharing a note
 * publishes it, it doesn't hand it over.
 */
async function authorize(
  bandId: string,
  noteId: string,
): Promise<NextResponse | { userId: string; authorId: string }> {
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const owner = await getNoteOwnership(noteId);
  // A note that isn't in this band is a 404 here, not somebody else's note.
  if (!owner || owner.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return { userId: guard.user.id, authorId: owner.authorId };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; noteId: string }> },
) {
  const { bandId, noteId } = await params;
  const auth = await authorize(bandId, noteId);
  if (auth instanceof NextResponse) return auth;

  const note = await getNoteForUser(noteId, auth.userId);
  if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ note });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; noteId: string }> },
) {
  const { bandId, noteId } = await params;
  const auth = await authorize(bandId, noteId);
  if (auth instanceof NextResponse) return auth;
  if (auth.authorId !== auth.userId)
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the author can edit this note.' },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > MAX_TITLE)
    return NextResponse.json(
      {
        error: 'bad_title',
        message: `Title must be 1–${MAX_TITLE} characters.`,
      },
      { status: 400 },
    );
  const text = typeof body?.body === 'string' ? body.body : '';
  if (text.length > MAX_BODY)
    return NextResponse.json(
      { error: 'too_long', message: 'That note is too long.' },
      { status: 413 },
    );

  await updateNote(noteId, {
    title,
    body: text.trim() ? text : null,
    shared: body?.shared === true,
    links: parseLinks(body?.links),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; noteId: string }> },
) {
  const { bandId, noteId } = await params;
  const auth = await authorize(bandId, noteId);
  if (auth instanceof NextResponse) return auth;
  if (auth.authorId !== auth.userId)
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the author can delete this note.' },
      { status: 403 },
    );

  await deleteNote(noteId);
  return new NextResponse(null, { status: 204 });
}
