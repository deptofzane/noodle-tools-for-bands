import { NextResponse } from 'next/server';
import { requireConversationMember } from '@/lib/api-guard';
import { createNote, sanitizeMentionIds } from '@/lib/db/notes';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/conversations/[conversationId]/notes
 *   Body: { timestampMs: number, body: string, mentions?: string[] }
 *   → create a top-level note. Requires band membership.
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
