import { NextResponse } from 'next/server';
import { requireBandMember, requireBandOwner } from '@/lib/api-guard';
import {
  bandStorageUsage,
  deleteBandFiles,
  listBandFiles,
} from '@/lib/db/song-files';

/**
 * GET /api/bands/[bandId]/files
 *   → every stored file in the band, plus what it all adds up to.
 *   Unpaged: the File management page sorts and filters in the browser, so it
 *   needs the whole set. Requires band membership, and reports whether this
 *   viewer may delete so the page can leave the controls out for members.
 *
 * DELETE /api/bands/[bandId]/files
 *   Body: { fileIds: string[] } → deletes them, bytes included.
 *   Owners only — deleting is destructive and shared.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const [files, usage] = await Promise.all([
    listBandFiles(bandId),
    bandStorageUsage(bandId),
  ]);
  return NextResponse.json({
    files,
    usage,
    canDelete: guard.membership.role === 'owner',
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandOwner(bandId);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  const fileIds: unknown = body?.fileIds;
  if (!Array.isArray(fileIds) || fileIds.some((id) => typeof id !== 'string'))
    return NextResponse.json(
      { error: 'bad_request', message: 'fileIds must be an array of ids.' },
      { status: 400 },
    );

  const result = await deleteBandFiles(bandId, fileIds as string[]);
  // The fresh total, so the page's usage bar doesn't have to guess.
  const usage = await bandStorageUsage(bandId);
  return NextResponse.json({ ...result, usage });
}
