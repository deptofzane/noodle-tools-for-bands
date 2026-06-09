import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import {
  deleteNote,
  NoteNotFoundError,
  setNoteResolved,
  updateNote,
  type NotesAuthor,
} from '@/lib/notes';

/**
 * PATCH  /api/files/[fileId]/notes/[noteId]?folder=<folderId>
 *   Body: { body: string }       → Edits a note's body.
 *   Body: { resolved: boolean }  → Toggles the resolved flag on a
 *                                  top-level thread.
 *
 *   Both variants are author-only — the data layer enforces this by
 *   only looking inside the requesting user's notes JSON file.
 *   Mixed bodies (both `body` and `resolved`) are rejected so the
 *   intent of the request is always unambiguous.
 *
 * DELETE /api/files/[fileId]/notes/[noteId]?folder=<folderId>
 *   → Deletes a note (and any replies the same user made to it).
 *     Replies authored by other users are left behind and will render
 *     as orphans in the UI — a v2 accepted tradeoff.
 *
 * The `noteId` is a UUID we generate at creation; it's just a string
 * to Drive. No id validation beyond a length check.
 */

function preflight(
  fileId: string,
  noteId: string,
  folderIdParam: string | null,
) {
  if (!folderIdParam || !isValidDriveId(folderIdParam)) {
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
  return null;
}

export async function PATCH(
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
  const bad = preflight(fileId, noteId, folderId);
  if (bad) return bad;

  const rawBody = await req.json().catch(() => null);
  const payload = validateNoteUpdate(rawBody);
  if ('error' in payload) return NextResponse.json(payload, { status: 400 });

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
    const updated =
      payload.kind === 'body'
        ? await updateNote(
            drive,
            { id: file.id, name: file.name },
            folderId!,
            actor,
            noteId,
            payload.body,
          )
        : await setNoteResolved(
            drive,
            { id: file.id, name: file.name },
            folderId!,
            actor,
            noteId,
            payload.resolved,
          );
    return NextResponse.json({ note: updated });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      // Note doesn't exist in the user's own file. Could mean the note
      // belongs to someone else (not editable) or doesn't exist at all.
      // Either way we report 404 — leaking ownership wouldn't help.
      return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
    }
    return driveErrorToResponse(err, 'updateNote failed');
  }
}

export async function DELETE(
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
  const bad = preflight(fileId, noteId, folderId);
  if (bad) return bad;

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
    await deleteNote(
      drive,
      { id: file.id, name: file.name },
      folderId!,
      actor,
      noteId,
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      return NextResponse.json({ error: 'note_not_found' }, { status: 404 });
    }
    return driveErrorToResponse(err, 'deleteNote failed');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type NoteUpdatePayload =
  | { kind: 'body'; body: string }
  | { kind: 'resolved'; resolved: boolean };

function validateNoteUpdate(
  input: unknown,
): NoteUpdatePayload | { error: string; message: string } {
  if (input == null || typeof input !== 'object') {
    return { error: 'bad_body', message: 'Request body must be JSON.' };
  }
  const i = input as Record<string, unknown>;

  const hasBody = 'body' in i;
  const hasResolved = 'resolved' in i;

  // Mixed payloads are ambiguous — caller must pick one operation per
  // request. Cheaper than guessing which field "wins."
  if (hasBody && hasResolved) {
    return {
      error: 'mixed_payload',
      message: 'Request may include `body` OR `resolved`, not both.',
    };
  }

  if (hasResolved) {
    if (typeof i.resolved !== 'boolean') {
      return {
        error: 'bad_resolved',
        message: '`resolved` must be a boolean.',
      };
    }
    return { kind: 'resolved', resolved: i.resolved };
  }

  if (typeof i.body !== 'string' || i.body.trim().length === 0) {
    return { error: 'empty_body', message: 'Note body cannot be empty.' };
  }
  if (i.body.length > 10_000) {
    return { error: 'body_too_long', message: 'Note body is too long.' };
  }
  return { kind: 'body', body: i.body.trim() };
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
