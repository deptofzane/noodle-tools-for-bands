import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getConversationMembership } from '@/lib/db/conversations';
import {
  deleteSheetVersion,
  setDefaultSheetVersion,
  setSheetVersionLabel,
  updateSheetVersionContent,
} from '@/lib/db/song-files';
import { sheetFormatFile, SHEET_TEXT_FORMATS } from '@/lib/sheet-preview';

/**
 * A single sheet-music version.
 *
 *   PATCH { default: true }            → make this the song's default version
 *   PATCH { label: string | null }     → set/clear this version's label
 *   PATCH { content: string, format }  → overwrite a text version's content
 *   DELETE                             → remove it (promotes the newest
 *                                        remaining version to default if this
 *                                        was it)
 *
 * All require band membership.
 */
const MAX_LABEL_LEN = 100;
const MAX_CONTENT_BYTES = 1_000_000; // 1 MB — text charts are tiny
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

  if (body && typeof body.content === 'string') {
    const content = body.content;
    if (!content.trim())
      return NextResponse.json(
        { error: 'bad_request', message: 'Content can’t be empty.' },
        { status: 400 },
      );
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    if (sizeBytes > MAX_CONTENT_BYTES)
      return NextResponse.json(
        { error: 'too_large', message: 'That’s too much text to save.' },
        { status: 413 },
      );
    const format = SHEET_TEXT_FORMATS.some((f) => f.id === body.format)
      ? body.format
      : 'markdown';
    const file = sheetFormatFile(format);
    const version = await updateSheetVersionContent({
      conversationId,
      versionId,
      body: Readable.from(content),
      sizeBytes,
      fileName: file.name,
      mimeType: file.type,
    });
    if (!version)
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ version });
  }

  return NextResponse.json(
    {
      error: 'bad_request',
      message: 'Provide { default: true }, { label }, or { content, format }.',
    },
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
