import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { listBandConversations } from '@/lib/db/conversations';
import {
  createSetlist,
  listBandSetlists,
  type SetlistItemInput,
} from '@/lib/db/setlists';

const MAX_LABEL = 100;

/**
 * GET  /api/bands/[bandId]/setlists
 *   → the band's setlists (newest first), each with its ordered songs.
 *
 * POST /api/bands/[bandId]/setlists
 *   Body: { name, items: [{ conversationId?|null, label?|null }] } — songs
 *   (validated as band songs, no dups) and/or markers (labels, e.g. a set
 *   break), in order. Legacy { conversationIds } is also accepted.
 *
 * Both require band membership.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ setlists: await listBandSetlists(bandId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 255)
    return NextResponse.json(
      { error: 'bad_name', message: 'Name must be 1–255 characters.' },
      { status: 400 },
    );

  // Normalize to a raw item list, accepting the legacy conversationIds form.
  const raw: unknown[] = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.conversationIds)
      ? body.conversationIds.map((id: unknown) => ({ conversationId: id }))
      : [];

  // Songs must belong to this band (unarchived), no duplicates; markers pass
  // through with a trimmed label. Invalid songs are skipped, in order.
  const allowed = new Set(
    (await listBandConversations(bandId))
      .filter((c) => !c.archived)
      .map((c) => c.id),
  );
  const items: SetlistItemInput[] = [];
  const seenSongs = new Set<string>();
  for (const entry of raw) {
    const it = entry as { conversationId?: unknown; label?: unknown };
    const cid = typeof it?.conversationId === 'string' ? it.conversationId : null;
    if (cid) {
      if (allowed.has(cid) && !seenSongs.has(cid)) {
        seenSongs.add(cid);
        items.push({ conversationId: cid, label: null });
      }
    } else {
      const label = typeof it?.label === 'string' ? it.label.trim() : '';
      if (label) items.push({ conversationId: null, label: label.slice(0, MAX_LABEL) });
    }
  }

  const setlist = await createSetlist({
    bandId,
    createdBy: user.id,
    name,
    items,
  });
  return NextResponse.json({ setlist }, { status: 201 });
}
