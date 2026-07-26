import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  NOTIFICATION_KINDS,
  getMutedKinds,
  getPushMutedKinds,
  setKindMuted,
  setKindPushMuted,
  type NotificationKind,
} from '@/lib/db/notifications';

/**
 * Notification preferences, per channel:
 *   - "feed" → whether a kind reaches the Home notification feed.
 *   - "push" → whether a kind is pushed to the user's devices. Independent of
 *              the feed, except a feed-mute already suppresses push too.
 *
 *   GET   → { muted: Kind[], pushMuted: Kind[] }
 *   PATCH { kind, enabled, channel?: 'feed' | 'push' }
 *     → mute (enabled:false) / unmute (enabled:true) for that channel.
 *       Defaults to 'feed' when channel is omitted (back-compat).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isKind(v: unknown): v is NotificationKind {
  return (
    typeof v === 'string' &&
    (NOTIFICATION_KINDS as readonly string[]).includes(v)
  );
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const [muted, pushMuted] = await Promise.all([
    getMutedKinds(user.id),
    getPushMutedKinds(user.id),
  ]);
  return NextResponse.json({ muted, pushMuted });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  const channel = body?.channel === 'push' ? 'push' : 'feed';
  if (!isKind(body?.kind) || typeof body?.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'bad_request', message: 'Provide { kind, enabled }.' },
      { status: 400 },
    );
  }

  if (channel === 'push') {
    await setKindPushMuted(user.id, body.kind, !body.enabled);
  } else {
    await setKindMuted(user.id, body.kind, !body.enabled);
  }
  return NextResponse.json({ ok: true });
}
