import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { createReply, NoteNotFoundError, sanitizeMentionIds } from '@/lib/db/notes';

/**
 * POST /api/conversations/[conversationId]/notes/[noteId]/replies
 *   Body: { body: string, mentions?: string[] }
 *   → reply to a note. Requires band membership; the reply inherits the
 *     parent note's timestamp.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string; noteId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, noteId } = await params;

  if (!(await getConversationMembership(user.id, conversationId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'empty_body' }, { status: 400 });
  if (text.length > 10_000)
    return NextResponse.json({ error: 'body_too_long' }, { status: 400 });

  try {
    const note = await createReply(
      conversationId,
      user.id,
      noteId,
      text,
      sanitizeMentionIds(body?.mentions),
    );
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    if (err instanceof NoteNotFoundError)
      return NextResponse.json({ error: 'parent_not_found' }, { status: 404 });
    throw err;
  }
}
