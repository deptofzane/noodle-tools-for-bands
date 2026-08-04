import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, type DbExecutor } from './index';
import { notes, noteMentions, users } from './schema';
import { recordActivity } from './activity';
import { touchConversation } from './conversations';

/**
 * Notes data layer (Postgres). Mirrors the surface of the old
 * Drive-backed `lib/notes.ts`, but threading, mentions, and activity are
 * now real rows + joins instead of merged JSON files.
 *
 * Authorization is the caller's job: routes must `assertConversationMember`
 * before calling these, and pass the resolved `authorId` (the current
 * user's DB id). Author-scoped ops (edit/resolve/delete) additionally
 * enforce ownership in their WHERE clause.
 *
 * Mentions are stored as user ids (FK to users). Deleting a top-level
 * note cascades its replies (DB-level), a deliberate change from the
 * Drive model's orphan behavior.
 */

export class NoteNotFoundError extends Error {
  constructor(noteId: string) {
    super(`Note not found or not owned by caller: ${noteId}`);
    this.name = 'NoteNotFoundError';
  }
}

export type StoredNote = typeof notes.$inferSelect;

export interface ApiNote {
  id: string;
  parentNoteId: string | null;
  timestampMs: number;
  body: string;
  resolved: boolean;
  mentions: string[]; // mentioned user ids
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  author: { id: string; name: string | null; email: string | null };
  isMine: boolean;
}

export interface ThreadedNote extends ApiNote {
  replies: ThreadedNote[];
}

/** Coerce client input into a clean list of mention user ids. */
export function sanitizeMentionIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || id.length > 255 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 50) break;
  }
  return out;
}

async function insertMentions(
  exec: DbExecutor,
  noteId: string,
  mentionUserIds: string[],
): Promise<void> {
  if (mentionUserIds.length === 0) return;
  await exec
    .insert(noteMentions)
    .values(
      mentionUserIds.map((mentionedUserId) => ({ noteId, mentionedUserId })),
    )
    .onConflictDoNothing();
}

/** Load + thread every (non-deleted) note in a conversation. */
export async function loadNotes(
  conversationId: string,
  currentUserId: string,
): Promise<ThreadedNote[]> {
  const rows = await db
    .select({
      id: notes.id,
      parentNoteId: notes.parentNoteId,
      timestampMs: notes.timestampMs,
      body: notes.body,
      resolved: notes.resolved,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      authorId: users.id,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.authorId))
    .where(
      and(eq(notes.conversationId, conversationId), isNull(notes.deletedAt)),
    );

  if (rows.length === 0) return [];

  const mentionRows = await db
    .select({
      noteId: noteMentions.noteId,
      userId: noteMentions.mentionedUserId,
    })
    .from(noteMentions)
    .where(
      inArray(
        noteMentions.noteId,
        rows.map((r) => r.id),
      ),
    );
  const mentionsByNote = new Map<string, string[]>();
  for (const m of mentionRows) {
    const arr = mentionsByNote.get(m.noteId) ?? [];
    arr.push(m.userId);
    mentionsByNote.set(m.noteId, arr);
  }

  const all: ApiNote[] = rows.map((r) => ({
    id: r.id,
    parentNoteId: r.parentNoteId,
    timestampMs: r.timestampMs,
    body: r.body,
    resolved: r.resolved,
    mentions: mentionsByNote.get(r.id) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    author: { id: r.authorId, name: r.authorName, email: r.authorEmail },
    isMine: r.authorId === currentUserId,
  }));

  return threadByParent(all);
}

function threadByParent(allNotes: ApiNote[]): ThreadedNote[] {
  const byParent = new Map<string | null, ApiNote[]>();
  for (const n of allNotes) {
    const arr = byParent.get(n.parentNoteId) ?? [];
    arr.push(n);
    byParent.set(n.parentNoteId, arr);
  }

  const build = (parentId: string | null): ThreadedNote[] => {
    const children = (byParent.get(parentId) ?? []).slice();
    children.sort((a, b) => {
      if (parentId === null) return a.timestampMs - b.timestampMs;
      return a.createdAt.localeCompare(b.createdAt);
    });
    return children.map((c) => ({ ...c, replies: build(c.id) }));
  };

  return build(null);
}

export async function createNote(
  conversationId: string,
  authorId: string,
  timestampMs: number,
  body: string,
  mentionUserIds: string[] = [],
): Promise<StoredNote> {
  return db.transaction(async (tx) => {
    const [note] = await tx
      .insert(notes)
      .values({
        conversationId,
        authorId,
        parentNoteId: null,
        timestampMs,
        body,
      })
      .returning();
    await insertMentions(tx, note!.id, mentionUserIds);
    await recordActivity(tx, conversationId, authorId, 'note-created');
    await touchConversation(tx, conversationId);
    return note!;
  });
}

export async function createReply(
  conversationId: string,
  authorId: string,
  parentNoteId: string,
  body: string,
  mentionUserIds: string[] = [],
): Promise<StoredNote> {
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .select({ timestampMs: notes.timestampMs })
      .from(notes)
      .where(
        and(
          eq(notes.id, parentNoteId),
          eq(notes.conversationId, conversationId),
          isNull(notes.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) throw new NoteNotFoundError(parentNoteId);

    const [reply] = await tx
      .insert(notes)
      .values({
        conversationId,
        authorId,
        parentNoteId,
        timestampMs: parent.timestampMs, // replies inherit the parent's mark
        body,
      })
      .returning();
    await insertMentions(tx, reply!.id, mentionUserIds);
    await recordActivity(tx, conversationId, authorId, 'reply-created');
    await touchConversation(tx, conversationId);
    return reply!;
  });
}

export async function updateNote(
  conversationId: string,
  authorId: string,
  noteId: string,
  newBody: string,
): Promise<StoredNote> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(notes)
      .set({ body: newBody, updatedAt: new Date() })
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.conversationId, conversationId),
          eq(notes.authorId, authorId),
          isNull(notes.deletedAt),
        ),
      )
      .returning();
    if (!updated) throw new NoteNotFoundError(noteId);
    await recordActivity(tx, conversationId, authorId, 'note-updated');
    await touchConversation(tx, conversationId);
    return updated;
  });
}

export async function setNoteResolved(
  conversationId: string,
  authorId: string,
  noteId: string,
  resolved: boolean,
): Promise<StoredNote> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.conversationId, conversationId),
          eq(notes.authorId, authorId),
          isNull(notes.deletedAt),
        ),
      )
      .limit(1);
    if (!current) throw new NoteNotFoundError(noteId);
    if (current.resolved === resolved) return current; // idempotent, no log

    const [updated] = await tx
      .update(notes)
      .set({ resolved, updatedAt: new Date() })
      .where(eq(notes.id, noteId))
      .returning();
    await recordActivity(
      tx,
      conversationId,
      authorId,
      resolved ? 'resolved' : 'unresolved',
    );
    await touchConversation(tx, conversationId);
    return updated!;
  });
}

export async function deleteNote(
  conversationId: string,
  authorId: string,
  noteId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Hard delete; replies cascade via the parent_note_id FK.
    const deleted = await tx
      .delete(notes)
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.conversationId, conversationId),
          eq(notes.authorId, authorId),
        ),
      )
      .returning({ id: notes.id });
    if (deleted.length === 0) throw new NoteNotFoundError(noteId);
    await recordActivity(tx, conversationId, authorId, 'note-deleted');
    await touchConversation(tx, conversationId);
  });
}
