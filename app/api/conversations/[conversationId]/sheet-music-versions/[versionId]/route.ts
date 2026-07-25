import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  deleteSheetVersion,
  setDefaultSheetVersion,
  setSheetVersionLabel,
} from '@/lib/db/song-files';

/**
 * A single sheet-music version.
 *
 *   PATCH { default: true }        → make this the song's default version
 *   PATCH { label: string | null } → set/clear this version's label
 *   DELETE                         → remove it (promotes the newest remaining
 *                                    version to default if this was it)
 *
 * All require band membership.
 */
const MAX_LABEL_LEN = 100;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ conversationId: string; versionId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { conversationId, versionId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  if (body && 'label' in body) {
    const raw = body.label;
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json(
        { error: 'bad_request', message: 'label must be a string or null.' },
        { status: 400 },
      );
    }
    if (typeof raw === 'string' && raw.length > MAX_LABEL_LEN) {
      return NextResponse.json(
        {
          error: 'bad_request',
          message: `Label must be ${MAX_LABEL_LEN} characters or fewer.`,
        },
        { status: 400 },
      );
    }
    const ok = await setSheetVersionLabel(conversationId, versionId, raw);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (body?.default === true) {
    const ok = await setDefaultSheetVersion(conversationId, versionId);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: 'bad_request', message: 'Provide { default: true } or { label }.' },
    { status: 400 },
  );
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ conversationId: string; versionId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { conversationId, versionId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await deleteSheetVersion(conversationId, versionId);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, newDefaultId: result.newDefaultId });
}
