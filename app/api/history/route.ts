import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { listPastEventsForUser } from '@/lib/db/events';
import { listClosedPollsForUser } from '@/lib/db/polls';
import { readWindow, splitPage } from '@/lib/paging';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/history?category=polls|events[&limit=&offset=]
 *   → one page of a History category, scoped to the caller's bands, plus
 *   `hasMore`. Fetched a category at a time, when its tab is opened — history
 *   is browsed rather than watched, so loading all of it up front would be
 *   work nobody asked for.
 *
 * Past events need the viewer's own `today` (`?today=YYYY-MM-DD`): "already
 * happened" is a question about their clock, not the server's.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const { limit, offset } = readWindow(url);
  // One past the page, so `hasMore` costs nothing extra.
  const probe = { limit: limit + 1, offset };

  if (category === 'polls') {
    const rows = await listClosedPollsForUser(user.id, probe);
    const { items, hasMore } = splitPage(rows, limit);
    return NextResponse.json({ polls: items, hasMore });
  }

  if (category === 'events') {
    const today = url.searchParams.get('today') ?? '';
    if (!DATE_RE.test(today))
      return NextResponse.json(
        { error: 'bad_date', message: 'today must be YYYY-MM-DD.' },
        { status: 400 },
      );
    const rows = await listPastEventsForUser(user.id, today, probe);
    const { items, hasMore } = splitPage(rows, limit);
    return NextResponse.json({ events: items, hasMore });
  }

  return NextResponse.json(
    { error: 'bad_category', message: 'category must be polls or events.' },
    { status: 400 },
  );
}
