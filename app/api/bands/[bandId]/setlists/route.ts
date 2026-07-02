import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { listBandConversations } from '@/lib/db/conversations';
import { createSetlist, listBandSetlists } from '@/lib/db/setlists';

/**
 * GET  /api/bands/[bandId]/setlists
 *   → the band's setlists (newest first), each with its ordered songs.
 *
 * POST /api/bands/[bandId]/setlists
 *   Body: { name: string, conversationIds: string[] }
 *   → create a setlist. Song ids are validated against the band's own
 *     (unarchived) songs, preserving the submitted order.
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

  const submitted: string[] = Array.isArray(body?.conversationIds)
    ? body.conversationIds.filter((v: unknown): v is string => typeof v === 'string')
    : [];

  // Keep only songs that belong to this band (unarchived), in the order
  // the user submitted them — deduped.
  const allowed = new Set(
    (await listBandConversations(bandId))
      .filter((c) => !c.archived)
      .map((c) => c.id),
  );
  const seen = new Set<string>();
  const conversationIds = submitted.filter(
    (id) => allowed.has(id) && !seen.has(id) && (seen.add(id), true),
  );

  const setlist = await createSetlist({
    bandId,
    createdBy: user.id,
    name,
    conversationIds,
  });
  return NextResponse.json({ setlist }, { status: 201 });
}
