import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import {
  NotesAccessError,
  createNote,
  loadNotes,
  sanitizeMentions,
  setConversationClosed,
  type NotesAuthor,
} from '@/lib/notes';

/**
 * GET  /api/files/[fileId]/notes?folder=<folderId>
 *   → Returns all notes for the audio file, merged from every
 *     collaborator's notes JSON and threaded by parentNoteId.
 *
 * POST /api/files/[fileId]/notes?folder=<folderId>
 *   Body: { timestampMs: number, body: string }
 *   → Creates a top-level note in the requesting user's notes file.
 *     Creates the subfolder + JSON file on first write.
 *
 * Both routes:
 *   - Require an authenticated session
 *   - Require Drive scopes (drive.readonly + drive.file)
 *   - Take `folder` as a required query param so we don't have to make
 *     an extra Drive call to discover the audio file's parent
 *   - Surface Drive errors as 403/500 with a descriptive message
 */

function preflight(folderIdParam: string | null, fileId: string) {
  if (!folderIdParam || !isValidDriveId(folderIdParam)) {
    return NextResponse.json(
      { error: 'folder_required', message: 'Missing or invalid folder id.' },
      { status: 400 },
    );
  }
  if (!isValidDriveId(fileId)) {
    return NextResponse.json({ error: 'invalid_file_id' }, { status: 400 });
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (session.error === 'RefreshAccessTokenError')
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  if (!hasAllDriveScopes(session.scopes))
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  if (!session.accessToken)
    return NextResponse.json({ error: 'no_token' }, { status: 401 });

  const { fileId } = await params;
  const folderId = new URL(req.url).searchParams.get('folder');
  const bad = preflight(folderId, fileId);
  if (bad) return bad;

  const drive = getDriveClient(session.accessToken);

  try {
    const fileRes = await drive.files.get({ fileId, fields: 'id, name' });
    const file = fileRes.data;
    if (!file.id || !file.name) {
      return NextResponse.json({ error: 'file_not_found' }, { status: 404 });
    }

    const result = await loadNotes(
      drive,
      { id: file.id, name: file.name },
      folderId!,
      session.user.sub,
    );
    return NextResponse.json({
      notes: result.notes,
      closed: result.closed,
      exists: result.exists,
      activity: result.activity,
    });
  } catch (err) {
    return driveErrorToResponse(err, 'loadNotes failed');
  }
}

/**
 * PATCH /api/files/[fileId]/notes?folder=<folderId>
 *   Body: { closed: boolean }
 *   → Set the conversation's closed state by renaming its notes
 *     subfolder (open ↔ closed). Idempotent; safe to call with the
 *     current state. Anyone with Drive folder write access can flip
 *     the state — Drive enforces this at the rename level.
 *
 *   Closing is "soft": all notes remain readable, individual notes
 *   can still be edited/deleted directly, and posting a new note to a
 *   closed conversation auto-reopens it (see addNoteToOwnFile).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (session.error === 'RefreshAccessTokenError')
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  if (!hasAllDriveScopes(session.scopes))
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  if (!session.accessToken)
    return NextResponse.json({ error: 'no_token' }, { status: 401 });

  const { fileId } = await params;
  const folderId = new URL(req.url).searchParams.get('folder');
  const bad = preflight(folderId, fileId);
  if (bad) return bad;

  const rawBody = await req.json().catch(() => null);
  if (rawBody == null || typeof rawBody !== 'object') {
    return NextResponse.json(
      { error: 'bad_body', message: 'Request body must be JSON.' },
      { status: 400 },
    );
  }
  const closedInput = (rawBody as Record<string, unknown>).closed;
  if (typeof closedInput !== 'boolean') {
    return NextResponse.json(
      { error: 'bad_closed', message: '`closed` must be a boolean.' },
      { status: 400 },
    );
  }

  const drive = getDriveClient(session.accessToken);

  try {
    const fileRes = await drive.files.get({ fileId, fields: 'id, name' });
    const file = fileRes.data;
    if (!file.id || !file.name) {
      return NextResponse.json({ error: 'file_not_found' }, { status: 404 });
    }

    const actor: NotesAuthor = {
      sub: session.user.sub,
      email: session.user.email,
      name: session.user.name,
    };
    const result = await setConversationClosed(
      drive,
      { id: file.id, name: file.name },
      folderId!,
      closedInput,
      actor,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotesAccessError) {
      return NextResponse.json(
        { error: 'no_conversation', message: err.message },
        { status: 404 },
      );
    }
    return driveErrorToResponse(err, 'setConversationClosed failed');
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (session.error === 'RefreshAccessTokenError')
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  if (!hasAllDriveScopes(session.scopes))
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  if (!session.accessToken)
    return NextResponse.json({ error: 'no_token' }, { status: 401 });

  const { fileId } = await params;
  const folderId = new URL(req.url).searchParams.get('folder');
  const bad = preflight(folderId, fileId);
  if (bad) return bad;

  const rawBody = await req.json().catch(() => null);
  const payload = validateNoteCreate(rawBody);
  if ('error' in payload) {
    return NextResponse.json(payload, { status: 400 });
  }

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
    const note = await createNote(
      drive,
      { id: file.id, name: file.name },
      folderId!,
      author,
      payload.timestampMs,
      payload.body,
      payload.mentions,
    );
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return driveErrorToResponse(err, 'createNote failed');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateNoteCreate(
  input: unknown,
):
  | { timestampMs: number; body: string; mentions: string[] }
  | { error: string; message: string } {
  if (input == null || typeof input !== 'object') {
    return { error: 'bad_body', message: 'Request body must be JSON.' };
  }
  const i = input as Record<string, unknown>;
  if (
    typeof i.timestampMs !== 'number' ||
    !Number.isFinite(i.timestampMs) ||
    i.timestampMs < 0
  ) {
    return { error: 'bad_timestamp', message: 'timestampMs must be a non-negative number.' };
  }
  if (typeof i.body !== 'string' || i.body.trim().length === 0) {
    return { error: 'empty_body', message: 'Note body cannot be empty.' };
  }
  if (i.body.length > 10_000) {
    return { error: 'body_too_long', message: 'Note body is too long (max 10,000 chars).' };
  }
  return {
    timestampMs: Math.floor(i.timestampMs),
    body: i.body.trim(),
    mentions: sanitizeMentions(i.mentions),
  };
}

function driveErrorToResponse(err: unknown, context: string) {
  const status =
    typeof err === 'object' && err !== null && 'code' in err
      ? Number((err as { code?: number }).code) || 500
      : 500;
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[notes] ${context}`, { status, message });
  const mapped =
    status === 404 ? 403 : status >= 400 && status < 500 ? status : 500;
  return NextResponse.json({ error: 'drive_error', message }, { status: mapped });
}
