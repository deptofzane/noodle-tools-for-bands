import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { markConversationRead } from '@/lib/db/listing';

/**
 * POST /api/conversations/[conversationId]/read
 *   → mark the conversation seen for the current user (clears its
 *     new/mentioned badges). Requires band membership.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId } = await params;

  if (!(await getConversationMembership(user.id, conversationId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await markConversationRead(user.id, conversationId);
  return NextResponse.json({ ok: true });
}
