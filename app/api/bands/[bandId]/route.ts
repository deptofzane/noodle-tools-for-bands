import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import {
  deleteBand,
  getBandById,
  getMembership,
  listMembers,
} from '@/lib/db/bands';

export async function GET(_req: Request, { params }: { params: Promise<{ bandId: string }> }) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const band = await getBandById(bandId);
  if (!band) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ band, members: await listMembers(bandId), myRole: membership.role });
}

/**
 * DELETE /api/bands/[bandId]
 *   → Permanently delete the band and everything it owns. Owners only.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { bandId } = await params;
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await deleteBand(bandId);
  return NextResponse.json({ ok: true });
}