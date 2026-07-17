import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
