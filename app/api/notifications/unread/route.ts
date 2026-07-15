import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getUnreadNotificationCount } from '@/lib/db/notifications';

/**
 * GET /api/notifications/unread
 *   → { unreadCount } only. Lightweight endpoint for the nav badge, which
 *     needs the number but not the list.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({
    unreadCount: await getUnreadNotificationCount(user.id),
  });
}
