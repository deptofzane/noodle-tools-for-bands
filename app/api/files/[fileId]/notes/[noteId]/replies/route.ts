import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import { createReply, NoteNotFoundError, type NotesAuthor } from '@/lib/notes';

/**
 * POST /api/files/[fileId]/notes/[noteId]/replies?folder=<folderId>
 *   Body: { body: string }
 *   → Adds a reply to the given note. The reply lives in the
 *     replier's own notes JSON file with parentNoteId set; the
 *     parent note may live in someone else's file (cross-file
 *     referencing is fine).
 *
 *   The reply inherits the parent's timestampMs so listing remains a
 *   single flat-then-thread pass.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ fileId: string; noteId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (session.error === 'RefreshAccessTokenError')
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  if (!hasAllDriveScopes(session.scopes))
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  if (!session.accessToken)
    return NextResponse.json({ error: 'no_token' }, { status: 401 });

  const { fileId, noteId } = await params;
  const folderId = new URL(req.url).searchParams.get('folder');
  if (!folderId || !isValidDriveId(folderId)) {
    return NextResponse.json(
      { error: 'folder_required', message: 'Missing or invalid folder id.' },
      { status: 400 },
    );
  }
  if (!isValidDriveId(fileId)) {
    return NextResponse.json({ error: 'invalid_file_id' }, { status: 400 });
  }
  if (!noteId || noteId.length < 8 || noteId.length > 64) {
    return NextResponse.json({ error: 'invalid_note_id' }, { status: 400 });
  }

  const rawBody = await req.json().catch(() => null);
  const payload = validateReplyCreate(rawBody);
  if ('error' in payload) return NextResponse.json(payload, { status: 400 });

  const drive = getDriveClient(session.accessToken);

  try {
    const fileRes = await drive.files.get({ fileId, fields: 'id, name' });
    const file = fileRes.data;
    if (!file.id || !file.name) {
      return NextResponse.json({ error: 'file_not_found' }, { status: 404 });
    }

    const author: NotesAuthor = {
      sub: session.user.sub,
      email: session.user.email,
      name: session.user.name,
    };

    const reply = await createReply(
      drive,
      { id: file.id, name: file.name },
      folderId,
      author,
      noteId,
      payload.body,
    );
    return NextResponse.json({ note: reply }, { status: 201 });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      return NextResponse.json({ error: 'parent_not_found' }, { status: 404 });
    }
    const status =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code) || 500
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notes] createReply failed', { status, message });
    const mapped =
      status === 404 ? 403 : status >= 400 && status < 500 ? status : 500;
    return NextResponse.json({ error: 'drive_error', message }, { status: mapped });
  }
}

function validateReplyCreate(
  input: unknown,
): { body: string } | { error: string; message: string } {
  if (input == null || typeof input !== 'object') {
    return { error: 'bad_body', message: 'Request body must be JSON.' };
  }
  const i = input as Record<string, unknown>;
  if (typeof i.body !== 'string' || i.body.trim().length === 0) {
    return { error: 'empty_body', message: 'Reply body cannot be empty.' };
  }
  if (i.body.length > 10_000) {
    return { error: 'body_too_long', message: 'Reply body is too long.' };
  }
  return { body: i.body.trim() };
}
