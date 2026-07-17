import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  NOTIFICATION_KINDS,
  getMutedKinds,
  setKindMuted,
  type NotificationKind,
} from '@/lib/db/notifications';

/**
 * Notification preferences (which kinds reach the feed).
 *
 *   GET   → { muted: NotificationKind[] }
 *   PATCH { kind, enabled } → mute (enabled:false) / unmute (enabled:true)
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
  return NextResponse.json({ muted: await getMutedKinds(user.id) });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  if (!isKind(body?.kind) || typeof body?.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'bad_request', message: 'Provide { kind, enabled }.' },
      { status: 400 },
    );
  }

  await setKindMuted(user.id, body.kind, !body.enabled);
  return NextResponse.json({ ok: true });
}
