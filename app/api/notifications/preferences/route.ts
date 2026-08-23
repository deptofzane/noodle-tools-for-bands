import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  NOTIFICATION_KINDS,
  getMutedKinds,
  getPushMutedKinds,
  setKindsMuted,
  setKindsPushMuted,
  type NotificationKind,
} from '@/lib/db/notifications';

/**
 * Notification preferences, per channel:
 *   - "feed" → whether a kind reaches the Home notification feed.
 *   - "push" → whether a kind is pushed to the user's devices. Independent of
 *              the feed, except a feed-mute already suppresses push too.
 *
 *   GET   → { muted: Kind[], pushMuted: Kind[] }
 *   PATCH { kind | kinds[], enabled, channel?: 'feed' | 'push' }
 *     → mute (enabled:false) / unmute (enabled:true) for that channel.
 *       Defaults to 'feed' when channel is omitted (back-compat).
 *
 *       `kinds` is what the Settings screen's master switches use: a category
 *       or the whole list moves in one request, so a half-applied group can't
 *       be left on screen. `kind` still works on its own for a single row.
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

  // One kind or many; a lone `kind` is just a batch of one.
  const raw: unknown[] = Array.isArray(body?.kinds)
    ? body.kinds
    : body?.kind !== undefined
      ? [body.kind]
      : [];
  // Every entry has to be real. Silently dropping an unknown one would report
  // success for a change the caller believes it made.
  if (
    raw.length === 0 ||
    !raw.every(isKind) ||
    typeof body?.enabled !== 'boolean'
  ) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Provide { kind | kinds[], enabled }.',
      },
      { status: 400 },
    );
  }
  const kinds = [...new Set(raw as NotificationKind[])];

  if (channel === 'push') {
    await setKindsPushMuted(user.id, kinds, !body.enabled);
  } else {
    await setKindsMuted(user.id, kinds, !body.enabled);
  }
  return NextResponse.json({ ok: true, count: kinds.length });
}
