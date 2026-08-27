import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  listConversationsForUser,
  type ConversationFilter,
} from '@/lib/db/listing';
import { readWindow, splitPage } from '@/lib/paging';

/**
 * GET /api/conversations/annotated?filter=open|closed|all[&limit=&offset=]
 *   → conversations across the user's bands, with server-computed
 *     "new"/"mentioned" badge state. Defaults to open.
 *
 * `&bandId=` narrows to one band — History shows only the selected band.
 * Membership is still what grants access, so an id the caller isn't in
 * matches nothing.
 *
 * Unpaged by default: Open Conversations shows everything still in flight,
 * and that list is bounded by how much is actually open. Pass `limit` to page
 * it — History does, since closed conversations only accumulate — and the
 * response then carries `hasMore`.
 *
 * The Postgres replacement for /api/notes/annotated — membership is the
 * access scope, so this also surfaces conversations the user was only
 * @-mentioned in (no broad Drive scan needed).
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const param = url.searchParams.get('filter');
  const filter: ConversationFilter =
    param === 'closed' || param === 'all' ? param : 'open';

  const bandId = url.searchParams.get('bandId') ?? undefined;

  if (!url.searchParams.has('limit')) {
    const conversations = await listConversationsForUser(
      user.id,
      filter,
      undefined,
      bandId,
    );
    return NextResponse.json({ conversations, hasMore: false });
  }

  const { limit, offset } = readWindow(url);
  // One past the page, so `hasMore` costs nothing extra.
  const rows = await listConversationsForUser(
    user.id,
    filter,
    { limit: limit + 1, offset },
    bandId,
  );
  const { items, hasMore } = splitPage(rows, limit);
  return NextResponse.json({ conversations: items, hasMore });
}
