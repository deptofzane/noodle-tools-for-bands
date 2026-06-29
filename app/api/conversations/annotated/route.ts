import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import {
  listConversationsForUser,
  type ConversationFilter,
} from '@/lib/db/listing';

/**
 * GET /api/conversations/annotated?filter=open|closed|all
 *   → conversations across the user's bands, with server-computed
 *     "new"/"mentioned" badge state. Defaults to open.
 *
 * The Postgres replacement for /api/notes/annotated — membership is the
 * access scope, so this also surfaces conversations the user was only
 * @-mentioned in (no broad Drive scan needed).
 */
export async function GET(req: Request) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const param = new URL(req.url).searchParams.get('filter');
  const filter: ConversationFilter =
    param === 'closed' || param === 'all' ? param : 'open';

  const conversations = await listConversationsForUser(user.id, filter);
  return NextResponse.json({ conversations });
}
