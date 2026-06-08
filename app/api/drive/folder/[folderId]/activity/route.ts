import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import { listFolderActivity } from '@/lib/notes';

/**
 * GET /api/drive/folder/[folderId]/activity
 *   → Per-conversation activity rollup for every audio file in the
 *     folder that anyone has annotated. Returns one entry per
 *     conversation with `audioFileId`, `audioFileName`,
 *     `lastModifiedISO`, `lastActivityBy`, and `closed`.
 *
 *     The Library client lazy-loads this *after* the audio list to
 *     render an "Updated 5m ago by X" line on each annotated file —
 *     matching the Open Conversations card style. Files with no
 *     activity are simply absent from the response and render
 *     without a footer.
 *
 *     Cost: 1 list + 1 list + N parallel reads, where N is the
 *     number of conversations in the folder. Don't poll this.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.error === 'RefreshAccessTokenError') {
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  }
  if (!hasAllDriveScopes(session.scopes)) {
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  }
  if (!session.accessToken) {
    return NextResponse.json({ error: 'no_token' }, { status: 401 });
  }

  const { folderId } = await params;
  if (!isValidDriveId(folderId)) {
    return NextResponse.json({ error: 'invalid_folder_id' }, { status: 400 });
  }

  const drive = getDriveClient(session.accessToken);

  try {
    const activity = await listFolderActivity(drive, folderId);
    return NextResponse.json({ activity });
  } catch (err) {
    const status =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code) || 500
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[drive] folder activity failed', {
      folderId,
      status,
      message,
    });
    return NextResponse.json(
      { error: 'drive_error', message },
      {
        status:
          status === 404
            ? 403
            : status >= 400 && status < 500
              ? status
              : 500,
      },
    );
  }
}
