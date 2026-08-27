import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { warningsForFiles } from '@/lib/db/song-files';

/**
 * POST /api/bands/[bandId]/files/preflight
 *   Body: { fileIds: string[] } → the warnings for that selection.
 *
 * Separate from the delete itself so the confirmation dialog can show what's
 * at stake *before* anything happens, and so the user can drop individual
 * files from the selection and ask again.
 *
 * Membership, not ownership: seeing why a delete would be a bad idea is not
 * itself destructive, and the page shows this to everyone.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  const fileIds: unknown = body?.fileIds;
  if (!Array.isArray(fileIds) || fileIds.some((id) => typeof id !== 'string'))
    return NextResponse.json(
      { error: 'bad_request', message: 'fileIds must be an array of ids.' },
      { status: 400 },
    );

  return NextResponse.json({
    warnings: await warningsForFiles(fileIds as string[], guard.user.id),
  });
}
