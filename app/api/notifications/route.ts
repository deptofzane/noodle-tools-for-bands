import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  getUnreadNotificationCount,
  listNotifications,
} from '@/lib/db/notifications';

/**
 * GET /api/notifications[?cursor=…]
 *   → { notifications, nextCursor, unreadCount } across every band the user
 *     belongs to (excluding their own actions). Used by the Home feed to poll
 *     for new activity (no cursor) and to page back through older notifications
 *     (passing a prior response's nextCursor).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const before = new URL(req.url).searchParams.get('cursor') ?? undefined;
  const [page, unreadCount] = await Promise.all([
    listNotifications(user.id, { before }),
    getUnreadNotificationCount(user.id),
  ]);
  return NextResponse.json({
    notifications: page.notifications,
    nextCursor: page.nextCursor,
    unreadCount,
  });
}
