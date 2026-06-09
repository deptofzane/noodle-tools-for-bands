import { randomUUID } from 'node:crypto';
import type { drive_v3 } from 'googleapis';
import {
  fetchActivityFile,
  findActivityFile,
  listActivityFilesByParent,
  recordActivity,
  type ConversationActivity,
} from '@/lib/activity';

/**
 * Notes data layer (Drive-backed).
 *
 * Storage model (from the build plan):
 *
 *   shared-folder/
 *   ├── recording.mp3
 *   └── recording.notes/                   <- one per audio file
 *       ├── user-<aliceSub>.json
 *       └── user-<bobSub>.json
 *
 * Each user owns and writes to ONE JSON file per audio. Loading notes
 * for a file = list everything in the subfolder matching `user-*.json`,
 * fetch each one, merge into a single threaded list. Writing notes =
 * find-or-create the subfolder, find-or-create your own file, mutate,
 * save.
 *
 * Concurrency model: each user only writes to their own file, so there
 * are no cross-user races on the same JSON blob. The remaining race is
 * one user with two open tabs — last write wins (a known limitation
 * we'll address with `If-Match`/`etag` in a later polish pass).
 *
 * This file uses the `googleapis` SDK (Node-only) and `node:crypto`.
 * Only Node-runtime API routes should import it — never middleware,
 * never `auth.config.ts`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What's literally stored in each note inside a notes JSON file. */
export interface StoredNote {
  id: string;
  timestampMs: number;
  /** null = top-level note. Any other id = reply to that note. */
  parentNoteId: string | null;
  body: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /**
   * Whether the thread is marked resolved. Only meaningful for
   * top-level notes (parentNoteId === null) — replies inherit nothing.
   * Optional for backward compatibility with notes written before the
   * field existed; absent/undefined reads as "not resolved" in the UI.
   */
  resolved?: boolean;
}

/** Author identity, denormalized into each notes file. */
export interface NotesAuthor {
  sub: string;
  email?: string | null;
  name?: string | null;
}

/** Schema of one user's notes JSON file. */
export interface NotesFileSchema {
  version: 1;
  audioFileId: string;
  audioFileName: string;
  owner: NotesAuthor;
  notes: StoredNote[];
}

/** What the API returns: stored fields + author info + ownership hint. */
export interface ApiNote extends StoredNote {
  author: NotesAuthor;
  /** True iff the requesting user authored this note. */
  isMine: boolean;
}

/** Threaded shape used by the UI: top-level notes carry their replies. */
export interface ThreadedNote extends ApiNote {
  replies: ThreadedNote[];
}

/** One entry in the Open Conversations / History views. */
export interface AnnotatedFileSummary {
  audioFileId: string;
  audioFileName: string;
  /**
   * When this conversation was last touched by *anyone* (per the
   * `_activity.json` primary file). Falls back to the requesting
   * user's own notes-file modifiedTime for legacy conversations
   * that don't yet have an activity file.
   */
  lastModifiedISO: string | null;
  /**
   * Who made the most recent change. Present only when an
   * `_activity.json` exists for this conversation (i.e., the
   * conversation has been touched since activity-tracking shipped).
   */
  lastActivityBy?: {
    sub: string;
    name?: string | null;
    email?: string | null;
  };
  /** True if the conversation has been marked closed (folder name ends in `.closed`). */
  closed: boolean;
}

/** Metadata about a notes subfolder, including its closed state. */
export interface NotesSubfolderInfo {
  id: string;
  name: string;
  closed: boolean;
}

// ---------------------------------------------------------------------------
// Constants + small helpers
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;
const NOTES_SUBFOLDER_SUFFIX = '.notes';
/**
 * A conversation is "closed" if its notes subfolder name ends with this
 * suffix (e.g., `recording.notes.closed`). The flag lives in the
 * folder name because Drive makes it cheap to query by name, it
 * survives the app (you can see closed conversations directly in
 * Drive's UI), and it doesn't require any extra metadata storage.
 *
 * Closing semantics: the conversation is hidden from the default
 * "Annotated" view, so it doesn't slow down that listing. It still
 * shows up in the "Full History" view, and it's still readable on the
 * notes page itself. Reading is non-mutating — viewing a closed
 * conversation doesn't reopen it. Adding a new note auto-reopens it.
 */
const CLOSED_SUFFIX = '.closed';
const NOTES_FILE_PREFIX = 'user-';
const JSON_MIME = 'application/json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function openSubfolderName(audioFileName: string): string {
  return audioBaseName(audioFileName) + NOTES_SUBFOLDER_SUFFIX;
}

function closedSubfolderName(audioFileName: string): string {
  return openSubfolderName(audioFileName) + CLOSED_SUFFIX;
}

function audioBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function userFileName(userSub: string): string {
  return `${NOTES_FILE_PREFIX}${userSub}.json`;
}

/** Escape a value for Drive's `q` query DSL (single-quoted strings). */
function escapeForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class NoteNotFoundError extends Error {
  constructor(noteId: string) {
    super(`Note not found: ${noteId}`);
    this.name = 'NoteNotFoundError';
  }
}

export class NotesAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotesAccessError';
  }
}

// ---------------------------------------------------------------------------
// Drive lookups
// ---------------------------------------------------------------------------

/**
 * Find the notes subfolder for an audio file in either its open
 * (`<basename>.notes`) or closed (`<basename>.notes.closed`) state.
 *
 * If both somehow exist (e.g., from manual renames in Drive's UI),
 * the open one wins. Callers that need to behave differently for
 * closed conversations can check `result.closed`.
 */
export async function findNotesSubfolder(
  drive: drive_v3.Drive,
  folderId: string,
  audioFileName: string,
): Promise<NotesSubfolderInfo | null> {
  const openName = openSubfolderName(audioFileName);
  const closedName = closedSubfolderName(audioFileName);
  const res = await drive.files.list({
    q: `'${escapeForQuery(folderId)}' in parents and mimeType = '${FOLDER_MIME}' and (name = '${escapeForQuery(openName)}' or name = '${escapeForQuery(closedName)}') and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 2,
  });

  const files = res.data.files ?? [];
  const open = files.find((f) => f.name === openName);
  if (open?.id && open.name) {
    return { id: open.id, name: open.name, closed: false };
  }
  const closed = files.find((f) => f.name === closedName);
  if (closed?.id && closed.name) {
    return { id: closed.id, name: closed.name, closed: true };
  }
  return null;
}

async function createNotesSubfolder(
  drive: drive_v3.Drive,
  folderId: string,
  audioFileName: string,
): Promise<NotesSubfolderInfo> {
  const subfolderName = openSubfolderName(audioFileName);
  const res = await drive.files.create({
    requestBody: {
      name: subfolderName,
      parents: [folderId],
      mimeType: FOLDER_MIME,
    },
    fields: 'id, name',
  });
  if (!res.data.id || !res.data.name) {
    throw new Error('Failed to create notes subfolder');
  }
  return { id: res.data.id, name: res.data.name, closed: false };
}

/** Rename the subfolder between its open and closed names. */
async function setSubfolderClosedState(
  drive: drive_v3.Drive,
  subFolder: NotesSubfolderInfo,
  audioFileName: string,
  closed: boolean,
): Promise<NotesSubfolderInfo> {
  if (subFolder.closed === closed) return subFolder;
  const targetName = closed
    ? closedSubfolderName(audioFileName)
    : openSubfolderName(audioFileName);
  await drive.files.update({
    fileId: subFolder.id,
    requestBody: { name: targetName },
  });
  return { ...subFolder, name: targetName, closed };
}

async function findFileByName(
  drive: drive_v3.Drive,
  parentId: string,
  fileName: string,
): Promise<{ id: string; modifiedTime?: string | null } | null> {
  const res = await drive.files.list({
    q: `'${escapeForQuery(parentId)}' in parents and name = '${escapeForQuery(fileName)}' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 1,
  });
  const f = res.data.files?.[0];
  if (!f?.id) return null;
  return { id: f.id, modifiedTime: f.modifiedTime };
}

async function listNotesFiles(
  drive: drive_v3.Drive,
  subFolderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const res = await drive.files.list({
    q: `'${escapeForQuery(subFolderId)}' in parents and mimeType = '${JSON_MIME}' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 200,
  });
  return (res.data.files ?? [])
    .filter(
      (f): f is { id: string; name: string } =>
        Boolean(f.id) &&
        Boolean(f.name) &&
        f.name!.startsWith(NOTES_FILE_PREFIX) &&
        f.name!.endsWith('.json'),
    )
    .map((f) => ({ id: f.id, name: f.name }));
}

async function fetchNotesFile(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<NotesFileSchema | null> {
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'json' },
    );
    const data = res.data as unknown;
    if (data && typeof data === 'object') {
      return data as NotesFileSchema;
    }
    if (typeof data === 'string') {
      return JSON.parse(data) as NotesFileSchema;
    }
    return null;
  } catch (err) {
    console.error('[notes] fetchNotesFile failed', { fileId, err });
    return null;
  }
}

async function writeNotesFile(
  drive: drive_v3.Drive,
  fileId: string,
  body: NotesFileSchema,
): Promise<void> {
  await drive.files.update({
    fileId,
    media: {
      mimeType: JSON_MIME,
      body: JSON.stringify(body, null, 2),
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LoadNotesResult {
  notes: ThreadedNote[];
  /** True iff the conversation is in its closed state (folder ends in `.closed`). */
  closed: boolean;
  /**
   * True iff a notes subfolder exists at all. Lets callers distinguish
   * "no notes yet" from "closed empty conversation." Used by the notes
   * panel to decide whether to render the Close/Reopen affordance.
   */
  exists: boolean;
  /**
   * The conversation's activity record (last touch + capped log of
   * recent activities). Absent for legacy conversations that haven't
   * been written to since activity-tracking shipped. Populated by
   * `loadNotes` from the same Drive round-trip that fetches the notes.
   */
  activity?: ConversationActivity;
}

/**
 * Load and merge the notes for an audio file from every collaborator's
 * notes JSON, plus the conversation's activity record (best-effort —
 * legacy conversations without an `_activity.json` simply omit it).
 *
 * Read-only operation — does NOT mutate the conversation's closed
 * state or write any activity, even when the conversation is closed.
 */
export async function loadNotes(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  currentUserSub: string,
): Promise<LoadNotesResult> {
  const subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) return { notes: [], closed: false, exists: false };

  // Kick off everything we need in parallel:
  //   - list user notes files in the subfolder
  //   - find the activity file (if any) in the subfolder
  // Each is one Drive call; the second is best-effort.
  const [files, activityFileRef] = await Promise.all([
    listNotesFiles(drive, subFolder.id),
    findActivityFile(drive, subFolder.id).catch(() => null),
  ]);

  // Notes file contents and activity content fetch — also in parallel.
  const [contents, activity] = await Promise.all([
    files.length === 0
      ? Promise.resolve([])
      : Promise.all(files.map((f) => fetchNotesFile(drive, f.id))),
    activityFileRef
      ? fetchActivityFile(drive, activityFileRef.id)
      : Promise.resolve(null),
  ]);

  const merged: ApiNote[] = [];
  for (const content of contents) {
    if (!content || !Array.isArray(content.notes)) continue;
    for (const note of content.notes) {
      merged.push({
        ...note,
        author: content.owner,
        isMine: content.owner?.sub === currentUserSub,
      });
    }
  }

  return {
    notes: threadByParent(merged),
    closed: subFolder.closed,
    exists: true,
    activity: activity ?? undefined,
  };
}

function threadByParent(all: ApiNote[]): ThreadedNote[] {
  const byParent = new Map<string | null, ApiNote[]>();
  for (const n of all) {
    const key = n.parentNoteId;
    const arr = byParent.get(key) ?? [];
    arr.push(n);
    byParent.set(key, arr);
  }

  const build = (parentId: string | null): ThreadedNote[] => {
    const children = (byParent.get(parentId) ?? []).slice();
    children.sort((a, b) => {
      if (parentId === null) return a.timestampMs - b.timestampMs;
      return a.createdAt.localeCompare(b.createdAt);
    });
    return children.map((c) => ({
      ...c,
      replies: build(c.id),
    }));
  };

  return build(null);
}

export async function createNote(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  author: NotesAuthor,
  timestampMs: number,
  body: string,
): Promise<StoredNote> {
  return addNoteToOwnFile(drive, audioFile, folderId, author, {
    timestampMs,
    body,
    parentNoteId: null,
  });
}

export async function createReply(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  author: NotesAuthor,
  parentNoteId: string,
  body: string,
): Promise<StoredNote> {
  // We need the parent's timestampMs (replies inherit it for query
  // simplicity). It might live in someone else's notes file, so we
  // search across all files.
  const subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) {
    throw new NoteNotFoundError(parentNoteId);
  }

  const files = await listNotesFiles(drive, subFolder.id);
  let parentTimestampMs: number | null = null;
  for (const f of files) {
    const content = await fetchNotesFile(drive, f.id);
    const parent = content?.notes.find((n) => n.id === parentNoteId);
    if (parent) {
      parentTimestampMs = parent.timestampMs;
      break;
    }
  }
  if (parentTimestampMs === null) {
    throw new NoteNotFoundError(parentNoteId);
  }

  return addNoteToOwnFile(drive, audioFile, folderId, author, {
    timestampMs: parentTimestampMs,
    body,
    parentNoteId,
  });
}

async function addNoteToOwnFile(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  author: NotesAuthor,
  draft: Pick<StoredNote, 'timestampMs' | 'body' | 'parentNoteId'>,
): Promise<StoredNote> {
  const now = new Date().toISOString();
  const note: StoredNote = {
    id: randomUUID(),
    timestampMs: draft.timestampMs,
    parentNoteId: draft.parentNoteId,
    body: draft.body,
    createdAt: now,
    updatedAt: now,
  };

  // Find or create the subfolder. If we find an existing one that's
  // closed, auto-reopen it — the user wants to add a note, which
  // implicitly says "this conversation isn't done after all." UI
  // surfaces this transition by refetching and watching the `closed`
  // flag flip to false.
  let subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) {
    subFolder = await createNotesSubfolder(drive, folderId, audioFile.name);
  } else if (subFolder.closed) {
    subFolder = await setSubfolderClosedState(
      drive,
      subFolder,
      audioFile.name,
      false,
    );
  }

  const myFileName = userFileName(author.sub);
  const existing = await findFileByName(drive, subFolder.id, myFileName);

  if (!existing) {
    const initial: NotesFileSchema = {
      version: SCHEMA_VERSION,
      audioFileId: audioFile.id,
      audioFileName: audioFile.name,
      owner: author,
      notes: [note],
    };
    await drive.files.create({
      requestBody: {
        name: myFileName,
        parents: [subFolder.id],
        mimeType: JSON_MIME,
      },
      media: {
        mimeType: JSON_MIME,
        body: JSON.stringify(initial, null, 2),
      },
    });
    await recordActivity(
      drive,
      subFolder.id,
      audioFile,
      subFolder.closed,
      author,
      draft.parentNoteId === null ? 'note-created' : 'reply-created',
    );
    return note;
  }

  const current = (await fetchNotesFile(drive, existing.id)) ?? {
    version: SCHEMA_VERSION,
    audioFileId: audioFile.id,
    audioFileName: audioFile.name,
    owner: author,
    notes: [],
  };
  current.notes.push(note);
  // Heal the metadata in case it's drifted (file renamed, etc.)
  current.audioFileId = audioFile.id;
  current.audioFileName = audioFile.name;
  current.owner = author;
  await writeNotesFile(drive, existing.id, current);
  await recordActivity(
    drive,
    subFolder.id,
    audioFile,
    subFolder.closed,
    author,
    draft.parentNoteId === null ? 'note-created' : 'reply-created',
  );
  return note;
}

export async function updateNote(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  author: NotesAuthor,
  noteId: string,
  newBody: string,
): Promise<StoredNote> {
  const subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) throw new NoteNotFoundError(noteId);

  const myFileName = userFileName(author.sub);
  const existing = await findFileByName(drive, subFolder.id, myFileName);
  if (!existing) throw new NoteNotFoundError(noteId);

  const current = await fetchNotesFile(drive, existing.id);
  if (!current) throw new NoteNotFoundError(noteId);

  const idx = current.notes.findIndex((n) => n.id === noteId);
  if (idx === -1) throw new NoteNotFoundError(noteId);

  const updated: StoredNote = {
    ...current.notes[idx]!,
    body: newBody,
    updatedAt: new Date().toISOString(),
  };
  current.notes[idx] = updated;
  await writeNotesFile(drive, existing.id, current);
  await recordActivity(
    drive,
    subFolder.id,
    audioFile,
    subFolder.closed,
    author,
    'note-updated',
  );
  return updated;
}

/**
 * Toggle the resolved flag on a thread.
 *
 * Same constraints as updateNote: only the thread author can flip the
 * flag, because the mutation only touches the author's own
 * `user-<sub>.json`. Replies and notes authored by anyone else are
 * untouched. The data layer enforces this implicitly — if the note
 * isn't found in the requesting user's file, we throw
 * `NoteNotFoundError`, identical to attempts to edit someone else's
 * note.
 *
 * Idempotent: calling with the already-current state is a no-op write
 * + no activity log entry, so accidental double-clicks don't spam the
 * activity log.
 */
export async function setNoteResolved(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  author: NotesAuthor,
  noteId: string,
  resolved: boolean,
): Promise<StoredNote> {
  const subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) throw new NoteNotFoundError(noteId);

  const myFileName = userFileName(author.sub);
  const existing = await findFileByName(drive, subFolder.id, myFileName);
  if (!existing) throw new NoteNotFoundError(noteId);

  const current = await fetchNotesFile(drive, existing.id);
  if (!current) throw new NoteNotFoundError(noteId);

  const idx = current.notes.findIndex((n) => n.id === noteId);
  if (idx === -1) throw new NoteNotFoundError(noteId);

  const previous = current.notes[idx]!;
  // Treat absent `resolved` as false for the comparison. If the flag
  // already matches the requested state, return immediately — no
  // write, no activity entry.
  if (Boolean(previous.resolved) === resolved) {
    return previous;
  }

  const updated: StoredNote = {
    ...previous,
    resolved,
    updatedAt: new Date().toISOString(),
  };
  current.notes[idx] = updated;
  await writeNotesFile(drive, existing.id, current);
  await recordActivity(
    drive,
    subFolder.id,
    audioFile,
    subFolder.closed,
    author,
    resolved ? 'resolved' : 'unresolved',
  );
  return updated;
}

export async function deleteNote(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  author: NotesAuthor,
  noteId: string,
): Promise<void> {
  const subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) throw new NoteNotFoundError(noteId);

  const myFileName = userFileName(author.sub);
  const existing = await findFileByName(drive, subFolder.id, myFileName);
  if (!existing) throw new NoteNotFoundError(noteId);

  const current = await fetchNotesFile(drive, existing.id);
  if (!current) throw new NoteNotFoundError(noteId);

  const target = current.notes.find((n) => n.id === noteId);
  if (!target) throw new NoteNotFoundError(noteId);

  // Drop the note and any replies WE made to it. Replies authored by
  // other users live in their own files and will render as orphans —
  // a v2 accepted tradeoff.
  current.notes = current.notes.filter(
    (n) => n.id !== noteId && n.parentNoteId !== noteId,
  );
  await writeNotesFile(drive, existing.id, current);
  await recordActivity(
    drive,
    subFolder.id,
    audioFile,
    subFolder.closed,
    author,
    'note-deleted',
  );
}

/**
 * List every audio file the current user has at least one note on.
 *
 * Strategy: search the user's Drive for files named `user-<mySub>.json`
 * that they own. Each such file is a notes JSON; fetch it to get the
 * audio file name + id + note count. Sorting + display happens in the
 * caller.
 *
 * Cost: 1 + N Drive calls (one list, one read per match). Acceptable
 * for a page the user explicitly navigates to; not something to poll.
 *
 * Caveat: if the user owns notes files for audio that's since been
 * deleted from Drive, those entries still appear here (we don't
 * cross-check the audio file's existence). Clicking through would 404
 * on the notes page. A garbage-collection sweep is a Phase 6 polish
 * item worth adding when this becomes annoying.
 */
export type AnnotatedFilesFilter = 'open' | 'closed' | 'all';

/**
 * Build the Open Conversations / History listing.
 *
 * Preferred path: read each conversation's `_activity.json` for the
 * audio file id/name, closed state, and "last touched by whom, when"
 * info. One activity file fetch replaces the previous per-conversation
 * pair of (parent-folder-name lookup + user-JSON content fetch).
 *
 * Fallback path: legacy conversations that don't have an activity
 * file yet (created before activity tracking shipped, or never touched
 * since) use the original logic — parent folder name for closed state,
 * the user's own notes JSON for audio metadata and modifiedTime. As
 * soon as anyone writes to such a conversation, an activity file is
 * created and subsequent loads use the preferred path.
 *
 * Cost shape:
 *   - Round 1: two parallel list queries (my user files + all
 *     visible activity files).
 *   - Round 2: per-conversation parallel fetches. Activity-tracked
 *     conversations: one activity fetch. Legacy: two fetches
 *     (user JSON + parent metadata) in parallel.
 */
export async function listAnnotatedFiles(
  drive: drive_v3.Drive,
  currentUserSub: string,
  options: { filter?: AnnotatedFilesFilter } = {},
): Promise<AnnotatedFileSummary[]> {
  const filter: AnnotatedFilesFilter = options.filter ?? 'open';
  const myFileName = userFileName(currentUserSub);

  // Round 1: list my own notes files (canonical proof of "I'm in
  // this conversation") in parallel with a broad query for all
  // activity files visible to me.
  const myFilesRes = await drive.files.list({
    q: `name = '${escapeForQuery(myFileName)}' and 'me' in owners and mimeType = '${JSON_MIME}' and trashed = false`,
    fields: 'files(id, name, modifiedTime, parents)',
    pageSize: 100,
  });
  const myFiles = myFilesRes.data.files ?? [];
  if (myFiles.length === 0) return [];

  const mySubfolderIds = new Set(
    myFiles
      .map((f) => f.parents?.[0])
      .filter((id): id is string => Boolean(id)),
  );

  // Bulk-resolve activity files for the subfolders I care about.
  const activityByParent = await listActivityFilesByParent(
    drive,
    mySubfolderIds,
  );

  // Round 2: per-conversation fetch. Prefer activity file when
  // present; fall back to the legacy lookup otherwise.
  const summaries = await Promise.all(
    myFiles.map<Promise<AnnotatedFileSummary | null>>(async (f) => {
      if (!f.id) return null;
      const subFolderId = f.parents?.[0];
      if (!subFolderId) return null;

      const activityFileId = activityByParent.get(subFolderId);

      if (activityFileId) {
        const activity = await fetchActivityFile(drive, activityFileId);
        if (activity?.audioFileId && activity?.audioFileName) {
          const closed = activity.closed;
          if (filter === 'open' && closed) return null;
          if (filter === 'closed' && !closed) return null;
          return {
            audioFileId: activity.audioFileId,
            audioFileName: activity.audioFileName,
            lastModifiedISO: activity.lastActivity.at,
            lastActivityBy: {
              sub: activity.lastActivity.by.sub,
              name: activity.lastActivity.by.name,
              email: activity.lastActivity.by.email,
            },
            closed,
          };
        }
        // Activity file unreadable for some reason — fall through to
        // the legacy path so the conversation still surfaces.
      }

      // Legacy fallback.
      const [content, parentInfo] = await Promise.all([
        fetchNotesFile(drive, f.id),
        drive.files
          .get({ fileId: subFolderId, fields: 'id, name' })
          .then((r) => r.data)
          .catch(() => null),
      ]);
      if (!content?.audioFileId || !content?.audioFileName) return null;
      if (!parentInfo?.name) return null;

      const closed = parentInfo.name.endsWith(CLOSED_SUFFIX);
      if (filter === 'open' && closed) return null;
      if (filter === 'closed' && !closed) return null;
      return {
        audioFileId: content.audioFileId,
        audioFileName: content.audioFileName,
        lastModifiedISO: f.modifiedTime ?? null,
        closed,
      };
    }),
  );

  return summaries.filter(
    (s): s is AnnotatedFileSummary => s !== null,
  );
}

/**
 * Open or close a conversation by renaming its notes subfolder.
 *
 * Anyone with folder write access can flip the state (it's a Drive
 * rename). Idempotent — calling with the already-current state is a
 * no-op. Throws if the conversation has no notes subfolder yet (i.e.,
 * nobody has added a note for this audio file).
 */
export async function setConversationClosed(
  drive: drive_v3.Drive,
  audioFile: { id: string; name: string },
  folderId: string,
  closed: boolean,
  actor: NotesAuthor,
): Promise<{ closed: boolean }> {
  const subFolder = await findNotesSubfolder(drive, folderId, audioFile.name);
  if (!subFolder) {
    throw new NotesAccessError('Conversation has no notes yet to update');
  }
  const previousClosed = subFolder.closed;
  const updated = await setSubfolderClosedState(
    drive,
    subFolder,
    audioFile.name,
    closed,
  );
  // Only log if the state actually flipped — calling close on an
  // already-closed conversation shouldn't show up in the activity log.
  if (previousClosed !== updated.closed) {
    await recordActivity(
      drive,
      updated.id,
      audioFile,
      updated.closed,
      actor,
      updated.closed ? 'closed' : 'reopened',
    );
  }
  return { closed: updated.closed };
}

// ---------------------------------------------------------------------------
// Per-folder activity rollup (Library view)
// ---------------------------------------------------------------------------

/** Per-conversation activity summary for the Library view. */
export interface FolderActivitySummary {
  audioFileId: string;
  audioFileName: string;
  /** ISO timestamp of the most recent cross-user activity. */
  lastModifiedISO: string;
  /** Who made the most recent change. */
  lastActivityBy: {
    sub: string;
    name?: string | null;
    email?: string | null;
  };
  closed: boolean;
}

/**
 * Activity rollup for every conversation in a Drive folder.
 *
 * Drives the Library view's "Updated 5m ago by X" line on each audio
 * file. Visibility is intentionally folder-scoped: this function looks
 * at every `<basename>.notes` / `<basename>.notes.closed` subfolder
 * sitting next to the audio files (regardless of who created it),
 * which means activity from *all* collaborators in that folder shows
 * up — not just the requesting user's. Compare with
 * `listAnnotatedFiles`, which scopes by "files I personally own a
 * user-<sub>.json in" for the Open Conversations / History views.
 *
 * Cost: 1 list (subfolders) + 1 list (activity files by parent) + N
 * activity reads in parallel, where N is the number of conversations
 * in the folder. Cheaper than listAnnotatedFiles's per-conversation
 * legacy fallback because we skip conversations that have no
 * `_activity.json` (no activity → no row in the Library footer).
 *
 * Subfolders without an activity file are silently dropped from the
 * result. The Library view treats "no activity" as "no footer line"
 * — there's no fall-through to per-user-file modifiedTime here, by
 * design.
 */
export async function listFolderActivity(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<FolderActivitySummary[]> {
  // Drive's `q` DSL supports `contains` but not `ends with`. Match all
  // subfolders whose name contains '.notes', then filter client-side
  // to exact open or closed suffixes so we don't pick up arbitrary
  // user-named folders containing the substring.
  const res = await drive.files.list({
    q:
      `'${escapeForQuery(folderId)}' in parents ` +
      `and mimeType = '${FOLDER_MIME}' ` +
      `and name contains '${NOTES_SUBFOLDER_SUFFIX}' ` +
      `and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 200,
  });

  const closedSuffix = NOTES_SUBFOLDER_SUFFIX + CLOSED_SUFFIX;
  const subFolderIds: string[] = [];
  for (const f of res.data.files ?? []) {
    if (!f.id || !f.name) continue;
    if (
      f.name.endsWith(closedSuffix) ||
      f.name.endsWith(NOTES_SUBFOLDER_SUFFIX)
    ) {
      subFolderIds.push(f.id);
    }
  }
  if (subFolderIds.length === 0) return [];

  const activityByParent = await listActivityFilesByParent(drive, subFolderIds);
  if (activityByParent.size === 0) return [];

  const summaries = await Promise.all(
    [...activityByParent.values()].map<
      Promise<FolderActivitySummary | null>
    >(async (activityFileId) => {
      const activity = await fetchActivityFile(drive, activityFileId);
      if (!activity?.audioFileId || !activity?.audioFileName) return null;
      return {
        audioFileId: activity.audioFileId,
        audioFileName: activity.audioFileName,
        lastModifiedISO: activity.lastActivity.at,
        lastActivityBy: {
          sub: activity.lastActivity.by.sub,
          name: activity.lastActivity.by.name,
          email: activity.lastActivity.by.email,
        },
        closed: activity.closed,
      };
    }),
  );

  return summaries.filter(
    (s): s is FolderActivitySummary => s !== null,
  );
}
