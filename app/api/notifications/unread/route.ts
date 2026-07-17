import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getUnreadNotificationCount } from '@/lib/db/notifications';

/**
 * GET /api/notifications/unread
 *   → { unreadCount } only. Lightweight endpoint for the nav badge, which
 *     needs the number but not the list.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({
    unreadCount: await getUnreadNotificationCount(user.id),
  });
}
