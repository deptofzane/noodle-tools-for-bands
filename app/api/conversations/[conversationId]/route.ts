import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import {
  ConversationConflictError,
  deleteConversation,
  getConversationMembership,
  moveConversation,
  renameConversation,
  setConversationArchived,
  setConversationClosed,
} from '@/lib/db/conversations';
import { getConversationActivity } from '@/lib/db/activity';
import { loadNotes } from '@/lib/db/notes';
import { getMembership, listMembers } from '@/lib/db/bands';
import { notify } from '@/lib/db/notifications';

/**
 * GET    /api/conversations/[conversationId]
 *   → { conversation, closed, notes (threaded), activity, members, myRole }
 *
 * PATCH  /api/conversations/[conversationId]
 *   Body may include any of: { closed?, name?, bandId?, archived? } —
 *   open/close, rename, move to another band you belong to, or archive.
 *
 * DELETE /api/conversations/[conversationId]
 *   → delete the song (cascades notes, mentions, activity, files).
 *
 * All require membership in the conversation's owning band.
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
  if (!body || typeof body !== 'object')
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  let conversation = membership.conversation;
  // Track whether a content edit (rename / move / archive) happened, so we
  // notify once at the end — not for plain open/close toggles.
  let edited = false;

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name || name.length > 255)
      return NextResponse.json(
        { error: 'bad_name', message: 'Name must be 1–255 characters.' },
        { status: 400 },
      );
    conversation = await renameConversation(conversationId, name);
    edited = true;
  }

  if (typeof body.bandId === 'string' && body.bandId !== conversation.bandId) {
    // You can only move a song to a band you belong to.
    if (!(await getMembership(user.id, body.bandId)))
      return NextResponse.json(
        { error: 'forbidden', message: 'You’re not a member of that band.' },
        { status: 403 },
      );
    try {
      conversation = await moveConversation(conversationId, body.bandId);
      edited = true;
    } catch (err) {
      if (err instanceof ConversationConflictError)
        return NextResponse.json({ error: 'conflict', message: err.message }, { status: 409 });
      throw err;
    }
  }

  if (typeof body.closed === 'boolean') {
    await setConversationClosed(conversationId, user.id, body.closed);
    conversation = { ...conversation, closed: body.closed };
  }

  if (typeof body.archived === 'boolean') {
    conversation = await setConversationArchived(conversationId, body.archived);
    edited = true;
  }

  if (edited) {
    await notify({
      bandId: conversation.bandId,
      actorId: user.id,
      kind: 'song-updated',
      subjectType: 'conversation',
      subjectId: conversationId,
      subjectLabel: conversation.audioFileName,
    });
  }

  return NextResponse.json({ conversation });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId } = await params;

  if (!(await getConversationMembership(user.id, conversationId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await deleteConversation(conversationId);
  return new NextResponse(null, { status: 204 });
}
