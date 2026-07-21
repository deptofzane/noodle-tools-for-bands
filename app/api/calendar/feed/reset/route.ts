import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { resetFeedToken } from '@/lib/db/calendarFeeds';

/**
 * POST /api/calendar/feed/reset — regenerate the caller's calendar feed
 * token, invalidating the previously-shared subscription URL. Returns the new
 * token so the UI can show the fresh URL.
 */
export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const token = await resetFeedToken(user.id);
  return NextResponse.json({ token });
}
