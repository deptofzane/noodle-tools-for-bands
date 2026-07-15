import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { markNotificationsRead } from '@/lib/db/notifications';

/**
 * POST /api/notifications/read
 *   → mark the whole notification feed read as of now (clears unread).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  await markNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
