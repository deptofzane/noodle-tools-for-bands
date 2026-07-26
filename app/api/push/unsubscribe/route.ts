import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { deletePushSubscription } from '@/lib/db/push-subscriptions';

/**
 * POST /api/push/unsubscribe
 *   Body: { endpoint } — remove this device's subscription for the current
 *   user (turning push off on that device).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  await deletePushSubscription(endpoint, user.id);
  return NextResponse.json({ ok: true });
}
