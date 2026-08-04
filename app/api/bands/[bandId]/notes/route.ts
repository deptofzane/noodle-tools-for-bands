import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { createNote, listBandNotesForUser } from '@/lib/db/user-notes';
import { parseLinks } from '@/lib/note-links';
import { readWindow, splitPage } from '@/lib/paging';

const MAX_TITLE = 200;
const MAX_BODY = 20_000;

/**
 * GET  /api/bands/[bandId]/notes[?limit=&offset=]
 *   → one page of the caller's notes in this band plus the band's shared
 *   ones, newest first, with `hasMore`.
 *
 * POST /api/bands/[bandId]/notes
 *   Body: { title, body?, shared?, links? } → create one, authored by the
 *   caller. Notes are private unless `shared` is true.
 *
 * Both require band membership.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  // One page at a time, with one row over the edge so `hasMore` is free.
  const { limit, offset } = readWindow(new URL(req.url));
  const rows = await listBandNotesForUser(bandId, guard.user.id, {
    limit: limit + 1,
    offset,
  });
  const { items, hasMore } = splitPage(rows, limit);
  return NextResponse.json({ notes: items, hasMore });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > MAX_TITLE)
    return NextResponse.json(
      {
        error: 'bad_title',
        message: `Title must be 1–${MAX_TITLE} characters.`,
      },
      { status: 400 },
    );
  const text = typeof body?.body === 'string' ? body.body : '';
  if (text.length > MAX_BODY)
    return NextResponse.json(
      { error: 'too_long', message: 'That note is too long.' },
      { status: 413 },
    );

  const { id } = await createNote({
    bandId,
    authorId: guard.user.id,
    title,
    body: text.trim() ? text : null,
    shared: body?.shared === true,
    links: parseLinks(body?.links),
  });
  return NextResponse.json({ id }, { status: 201 });
}
