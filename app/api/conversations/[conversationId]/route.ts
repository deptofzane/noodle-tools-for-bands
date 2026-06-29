import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership, setConversationClosed } from '@/lib/db/conversations';
import { getConversationActivity } from '@/lib/db/activity';
import { loadNotes } from '@/lib/db/notes';
import { listMembers } from '@/lib/db/bands';

/**
 * GET   /api/conversations/[conversationId]
 *   → { conversation, closed, notes (threaded), activity, myRole }
 *
 * PATCH /api/conversations/[conversationId]
 *   Body: { closed: boolean } → open/close the conversation.
 *
 * Both require membership in the conversation's owning band.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId } = await params;

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [notes, activity, members] = await Promise.all([
    loadNotes(conversationId, user.id),
    getConversationActivity(conversationId),
    listMembers(membership.conversation.bandId),
  ]);

  return NextResponse.json({
    conversation: membership.conversation,
    closed: membership.conversation.closed,
    notes,
    activity,
    members,
    myRole: membership.role,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId } = await params;

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (typeof body?.closed !== 'boolean')
    return NextResponse.json(
      { error: 'bad_request', message: '`closed` must be a boolean.' },
      { status: 400 },
    );

  const result = await setConversationClosed(conversationId, user.id, body.closed);
  return NextResponse.json(result);
}
