import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { createNote, sanitizeMentionIds } from '@/lib/db/notes';

/**
 * POST /api/conversations/[conversationId]/notes
 *   Body: { timestampMs: number, body: string, mentions?: string[] }
 *   → create a top-level note. Requires band membership.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId } = await params;

  if (!(await getConversationMembership(user.id, conversationId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const timestampMs = body?.timestampMs;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0)
    return NextResponse.json({ error: 'bad_timestamp' }, { status: 400 });
  if (!text)
    return NextResponse.json({ error: 'empty_body' }, { status: 400 });
  if (text.length > 10_000)
    return NextResponse.json({ error: 'body_too_long' }, { status: 400 });

  const note = await createNote(
    conversationId,
    user.id,
    Math.floor(timestampMs),
    text,
    sanitizeMentionIds(body?.mentions),
  );
  return NextResponse.json({ note }, { status: 201 });
}
