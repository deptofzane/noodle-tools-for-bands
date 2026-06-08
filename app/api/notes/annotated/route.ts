import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import {
  listAnnotatedFiles,
  type AnnotatedFilesFilter,
} from '@/lib/notes';

/**
 * GET /api/notes/annotated
 *   → Returns every audio file the requesting user has annotated.
 *     Backed by a Drive search for files named `user-<mySub>.json`
 *     that the user owns. Returns one entry per matched file with
 *     the audio's name, id, and note count.
 *
 *   This is N+1 Drive calls (1 list + 1 fetch per match). Fine for a
 *   page-load. Don't poll this endpoint.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (session.error === 'RefreshAccessTokenError')
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  if (!hasAllDriveScopes(session.scopes))
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  if (!session.accessToken)
    return NextResponse.json({ error: 'no_token' }, { status: 401 });

  // ?filter=open|closed|all (default: open). Anything else falls back to
  // 'open' so a malformed value never silently widens the scope.
  const filterParam = new URL(req.url).searchParams.get('filter');
  const filter: AnnotatedFilesFilter =
    filterParam === 'closed' || filterParam === 'all' ? filterParam : 'open';

  const drive = getDriveClient(session.accessToken);

  try {
    const files = await listAnnotatedFiles(drive, session.user.sub, {
      filter,
    });
    // Most recently modified first.
    files.sort((a, b) => {
      const aT = a.lastModifiedISO ?? '';
      const bT = b.lastModifiedISO ?? '';
      return bT.localeCompare(aT);
    });
    return NextResponse.json({ files });
  } catch (err) {
    const status =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code) || 500
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes/annotated] failed', { status, message });
    return NextResponse.json(
      { error: 'drive_error', message },
      { status: status >= 400 && status < 500 ? status : 500 },
    );
  }
}
