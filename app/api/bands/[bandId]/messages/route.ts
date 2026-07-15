import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { createBandMessage, listBandMessages } from '@/lib/db/band-messages';
import { sanitizeMentionIds } from '@/lib/db/notes';
import { notify } from '@/lib/db/notifications';

/**
 * Band chat messages.
 *
 *   GET  ?before=<iso>&limit=<n> → a page of messages, oldest→newest
 *   POST { body }                → post a message
 *
 * Both require band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const before = url.searchParams.get('before') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const page = await listBandMessages(bandId, {
    before,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return NextResponse.json(page);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const body = typeof json?.body === 'string' ? json.body.trim() : '';
  if (!body) {
    return NextResponse.json(
      { error: 'empty', message: 'A message body is required.' },
      { status: 400 },
    );
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json(
      { error: 'too_long', message: `Messages are limited to ${MAX_BODY} characters.` },
      { status: 400 },
    );
  }

  const mentions = sanitizeMentionIds(json?.mentions);
  const message = await createBandMessage(bandId, user.id, body, mentions);
  await notify({
    bandId,
    actorId: user.id,
    kind: 'chat-message',
    subjectType: 'band',
    subjectId: bandId,
  });
  return NextResponse.json({ message }, { status: 201 });
}
