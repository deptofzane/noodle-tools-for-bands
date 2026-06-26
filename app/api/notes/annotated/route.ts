import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import {
  listAnnotatedFiles,
  listMentionsOfUser,
  type AnnotatedFileSummary,
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
    // Two independent scans run in parallel:
    //   - listAnnotatedFiles: conversations I've personally posted in
    //     (participation-scoped).
    //   - listMentionsOfUser: conversations I was @-mentioned in,
    //     including ones I've never posted in.
    // We merge them so a mention surfaces a conversation even when the
    // participation scan wouldn't have found it.
    const [files, mentions] = await Promise.all([
      listAnnotatedFiles(drive, session.user.sub, { filter }),
      listMentionsOfUser(drive, session.user.sub),
    ]);

    const byId = new Map<string, AnnotatedFileSummary>(
      files.map((f) => [f.audioFileId, { ...f }]),
    );

    for (const m of mentions) {
      // Respect the same open/closed filter the list view uses, so a
      // mention in a closed conversation doesn't leak into "Open".
      if (filter === 'open' && m.closed) continue;
      if (filter === 'closed' && !m.closed) continue;

      const existing = byId.get(m.audioFileId);
      if (existing) {
        existing.mentionedAt = m.mentionedAt;
        existing.mentionedBy = m.mentionedBy;
      } else {
        byId.set(m.audioFileId, {
          audioFileId: m.audioFileId,
          audioFileName: m.audioFileName,
          // No participation row, so the mention is the only timestamp
          // we have to sort/display by.
          lastModifiedISO: m.mentionedAt,
          closed: m.closed,
          mentionedAt: m.mentionedAt,
          mentionedBy: m.mentionedBy,
        });
      }
    }

    const merged = [...byId.values()];
    // Most recently modified first.
    merged.sort((a, b) => {
      const aT = a.lastModifiedISO ?? '';
      const bT = b.lastModifiedISO ?? '';
      return bT.localeCompare(aT);
    });
    return NextResponse.json({ files: merged });
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
