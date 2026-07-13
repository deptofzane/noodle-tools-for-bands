import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  deleteAudioVersion,
  setAudioVersionLabel,
  setDefaultAudioVersion,
} from '@/lib/db/song-files';

/**
 * A single audio version.
 *
 *   PATCH { default: true }    → make this the song's default version
 *   PATCH { label: string|null } → set/clear this version's label
 *   DELETE                     → remove this version (promotes the newest
 *                                remaining version to default if this was it)
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
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, versionId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  // Label update: accept a string (set) or null (clear).
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
        { error: 'bad_request', message: `Label must be ${MAX_LABEL_LEN} characters or fewer.` },
        { status: 400 },
      );
    }
    const ok = await setAudioVersionLabel(conversationId, versionId, raw);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (body?.default === true) {
    const ok = await setDefaultAudioVersion(conversationId, versionId);
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
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { conversationId, versionId } = await params;
  if (!(await getConversationMembership(user.id, conversationId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await deleteAudioVersion(conversationId, versionId);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, newDefaultId: result.newDefaultId });
}
