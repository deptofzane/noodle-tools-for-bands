import { NextResponse } from 'next/server';
import { requireConversationMember } from '@/lib/api-guard';
import { createNote, sanitizeMentionIds } from '@/lib/db/notes';
import { setConversationClosed } from '@/lib/db/conversations';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/conversations/[conversationId]/notes
 *   Body: { timestampMs: number, body: string, mentions?: string[] }
 *   → create a top-level note. Requires band membership. Reopens the
 *     conversation if it was closed.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const guard = await requireConversationMember(conversationId);
  if (guard instanceof NextResponse) return guard;
  const { user, membership } = guard;

  const body = await req.json().catch(() => null);
  const timestampMs = body?.timestampMs;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (
    typeof timestampMs !== 'number' ||
    !Number.isFinite(timestampMs) ||
    timestampMs < 0
  )
    return NextResponse.json({ error: 'bad_timestamp' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'empty_body' }, { status: 400 });
  if (text.length > 10_000)
    return NextResponse.json({ error: 'body_too_long' }, { status: 400 });

  const note = await createNote(
    conversationId,
    user.id,
    Math.floor(timestampMs),
    text,
    sanitizeMentionIds(body?.mentions),
  );
  // A comment on a closed conversation reopens it: the thread is clearly live
  // again, and some surfaces that let you comment (the full-screen player)
  // deliberately have no Reopen control. No-ops when it's already open.
  if (membership.conversation.closed)
    await setConversationClosed(conversationId, user.id, false);

  await notify({
    bandId: membership.conversation.bandId,
    actorId: user.id,
    kind: 'song-comment',
    subjectType: 'conversation',
    subjectId: conversationId,
    subjectLabel: membership.conversation.audioFileName,
  });
  return NextResponse.json({ note }, { status: 201 });
}
