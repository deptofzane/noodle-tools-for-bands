import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { getMembership } from '@/lib/db/bands';
import { listBandConversations } from '@/lib/db/conversations';
import {
  deleteSetlist,
  getSetlist,
  renameSetlist,
  setSetlistSongs,
  type SetlistItemInput,
} from '@/lib/db/setlists';

const MAX_LABEL = 100;

/**
 * GET /api/bands/[bandId]/setlists/[setlistId]
 *   → one setlist with its items in order.
 *
 * Exists so callers that want a single setlist don't have to pull the band's
 * whole collection to find it — the list endpoint returns every setlist with
 * every song, which is a lot of rows to ship for one.
 *
 * Requires band membership; the setlist must belong to the band.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; setlistId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, setlistId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const setlist = await getSetlist(setlistId);
  // Same 404 for "gone" and "another band's": membership already passed, so
  // distinguishing them would confirm the id exists somewhere.
  if (!setlist || setlist.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ setlist });
}

/**
 * PATCH /api/bands/[bandId]/setlists/[setlistId]
 *   Body: { name?: string, items?: Array<{ conversationId?, label? }> }
 *   — `items` is the setlist's contents in their new order (add / remove /
 *   reorder); an item is a song (conversationId, must be a band song, no
 *   dups) or a marker (label, e.g. a set break). Legacy `{ conversationIds }`
 *   is also accepted. `name` renames the setlist; either may be sent alone,
 *   so a rename doesn't have to restate the whole list.
 *
 * Requires band membership; the setlist must belong to the band.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; setlistId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, setlistId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);

  // A rename can arrive on its own or alongside new items. Same 1–255 rule
  // the create route applies, so a name can't be valid in one and not the
  // other.
  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 255)
      return NextResponse.json(
        { error: 'bad_name', message: 'Name must be 1–255 characters.' },
        { status: 400 },
      );
    await renameSetlist(setlistId, name);
    if (body?.items === undefined && body?.conversationIds === undefined) {
      return NextResponse.json({ ok: true });
    }
  }
  // Normalize to a raw item list, accepting the legacy conversationIds form.
  const raw: unknown[] = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.conversationIds)
      ? body.conversationIds.map((id: unknown) => ({ conversationId: id }))
      : [];

  const bandSongs = new Set(
    (await listBandConversations(bandId)).map((c) => c.id),
  );

  const items: SetlistItemInput[] = [];
  const seenSongs = new Set<string>();
  for (const entry of raw) {
    const it = entry as { conversationId?: unknown; label?: unknown };
    const cid =
      typeof it?.conversationId === 'string' ? it.conversationId : null;
    if (cid) {
      // Songs must belong to this band, with no duplicates.
      if (!bandSongs.has(cid) || seenSongs.has(cid)) {
        return NextResponse.json(
          { error: 'bad_songs', message: 'Songs must belong to this band.' },
          { status: 400 },
        );
      }
      seenSongs.add(cid);
      items.push({ conversationId: cid, label: null });
    } else {
      // Marker (set break / custom). Skip empty labels.
      const label = typeof it?.label === 'string' ? it.label.trim() : '';
      if (label)
        items.push({ conversationId: null, label: label.slice(0, MAX_LABEL) });
    }
  }

  await setSetlistSongs(setlistId, items);
  return NextResponse.json({ setlist: await getSetlist(setlistId) });
}

/**
 * DELETE /api/bands/[bandId]/setlists/[setlistId] — permanently delete the
 * setlist (its songs cascade; any event's association to it is cleared).
 * Requires band membership; the setlist must belong to the band.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; setlistId: string }> },
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { bandId, setlistId } = await params;
  if (!(await getMembership(user.id, bandId)))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await deleteSetlist(setlistId);
  return new NextResponse(null, { status: 204 });
}
