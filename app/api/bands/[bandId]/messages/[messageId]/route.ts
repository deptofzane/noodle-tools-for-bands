import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { deleteBandMessage, editBandMessage } from '@/lib/db/band-messages';
import { sanitizeMentionIds } from '@/lib/db/notes';

/**
 * A single band message.
 *
 *   PATCH { body, mentions? } → edit (author only)
 *   DELETE                    → soft-delete (author or band owner)
 *
 * Both require band membership.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 4000;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; messageId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, messageId } = await params;

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
      {
        error: 'too_long',
        message: `Messages are limited to ${MAX_BODY} characters.`,
      },
      { status: 400 },
    );
  }

  const mentions = sanitizeMentionIds(json?.mentions);
  const message = await editBandMessage(
    bandId,
    messageId,
    user.id,
    body,
    mentions,
  );
  if (!message) {
    // Missing, deleted, or not the caller's message.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ message });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; messageId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, messageId } = await params;

  const membership = await getMembership(user.id, bandId);
  if (!membership) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const deleted = await deleteBandMessage(
    bandId,
    messageId,
    user.id,
    membership.role === 'owner',
  );
  if (!deleted) {
    // Either the message doesn't exist, is already gone, or isn't the
    // caller's to delete — don't distinguish.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
