import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { deleteNote, NoteNotFoundError, setNoteResolved, updateNote } from '@/lib/db/notes';

/**
 * PATCH  /api/conversations/[conversationId]/notes/[noteId]
 *   Body: { body: string } | { resolved: boolean }
 * DELETE /api/conversations/[conversationId]/notes/[noteId]
 *
 * All require band membership; the data layer additionally enforces that
 * the caller authored the note (else 404).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ conversationId: string; noteId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, noteId } = await params;

  if (!(await getConversationMembership(user.id, conversationId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);

  try {
    if (typeof body?.resolved === 'boolean') {
      const note = await setNoteResolved(conversationId, user.id, noteId, body.resolved);
      return NextResponse.json({ note });
    }
    if (typeof body?.body === 'string') {
      const text = body.body.trim();
      if (!text) return NextResponse.json({ error: 'empty_body' }, { status: 400 });
      if (text.length > 10_000)
        return NextResponse.json({ error: 'body_too_long' }, { status: 400 });
      const note = await updateNote(conversationId, user.id, noteId, text);
      return NextResponse.json({ note });
    }
    return NextResponse.json(
      { error: 'bad_request', message: 'Provide `body` or `resolved`.' },
      { status: 400 },
    );
  } catch (err) {
    if (err instanceof NoteNotFoundError)
      return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string; noteId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, noteId } = await params;

  if (!(await getConversationMembership(user.id, conversationId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    await deleteNote(conversationId, user.id, noteId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof NoteNotFoundError)
      return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
    throw err;
  }
}
