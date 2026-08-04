import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  isAllowedPushEndpoint,
  savePushSubscription,
} from '@/lib/db/push-subscriptions';

/**
 * POST /api/push/subscribe
 *   Body: a browser PushSubscription JSON — { endpoint, keys: { p256dh, auth } }.
 *   Stores it for the current user's device so notifications can be pushed to
 *   it. Idempotent (keyed by endpoint).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
  if (!endpoint || !p256dh || !auth)
    return NextResponse.json(
      {
        error: 'bad_subscription',
        message: 'A valid push subscription is required.',
      },
      { status: 400 },
    );
  // Reject endpoints that aren't a known HTTPS push service (SSRF guard).
  if (!isAllowedPushEndpoint(endpoint))
    return NextResponse.json(
      { error: 'bad_endpoint', message: 'Unsupported push endpoint.' },
      { status: 400 },
    );

  await savePushSubscription({
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
