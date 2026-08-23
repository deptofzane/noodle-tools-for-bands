import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import {
  countPinnedNotes,
  createNote,
  listBandNotesForUser,
  listPinnedNotes,
  PINNED_PREVIEW,
  type NoteScope,
} from '@/lib/db/user-notes';
import { parseLinks } from '@/lib/note-links';
import { readWindow, splitPage } from '@/lib/paging';

const MAX_TITLE = 200;
const MAX_BODY = 20_000;

/**
 * GET  /api/bands/[bandId]/notes[?limit=&offset=&scope=&pinned=&all=]
 *   → one page of the caller's notes in this band plus the band's shared
 *   ones, newest first, with `hasMore`. `scope=personal` narrows to the
 *   caller's own, `scope=shared` to the band's shared ones. Pinned notes are
 *   excluded — they render in their own section.
 *
 *   `pinned=1` returns that section instead: the ten most recent pins, plus
 *   `total` so the "Load all" button can name the real number. `all=1`
 *   returns every one of them in a single response — the section is short by
 *   nature, so it isn't worth paging.
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

  const url = new URL(req.url);
  // Anything unrecognised means the unnarrowed list, so a stale or hand-typed
  // scope shows everything rather than nothing.
  const raw = url.searchParams.get('scope');
  const scope: NoteScope = raw === 'personal' || raw === 'shared' ? raw : 'all';

  if (url.searchParams.get('pinned') === '1') {
    const all = url.searchParams.get('all') === '1';
    const [notes, total] = await Promise.all([
      listPinnedNotes(
        bandId,
        guard.user.id,
        scope,
        all ? undefined : PINNED_PREVIEW,
      ),
      countPinnedNotes(bandId, guard.user.id, scope),
    ]);
    return NextResponse.json({ notes, total });
  }

  // One page at a time, with one row over the edge so `hasMore` is free.
  const { limit, offset } = readWindow(url);
  const rows = await listBandNotesForUser(
    bandId,
    guard.user.id,
    { limit: limit + 1, offset },
    scope,
  );
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
