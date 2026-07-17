import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { markNotificationsRead } from '@/lib/db/notifications';

/**
 * POST /api/notifications/read
 *   → mark the whole notification feed read as of now (clears unread).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  await markNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
