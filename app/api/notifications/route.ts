import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import {
  getUnreadNotificationCount,
  listNotifications,
} from '@/lib/db/notifications';

/**
 * GET /api/notifications
 *   → { notifications, unreadCount } across every band the user belongs to
 *     (excluding their own actions). Used by the Home feed to poll.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
