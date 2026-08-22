import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from './index';
import { users, userNoteLinks, userNotes } from './schema';

/**
 * A member's own notes within a band.
 *
 * Private by default and readable only by their author; `shared` opens one to
 * the rest of the band. Editing and deleting always stay with the author, so
 * sharing is publishing, not handing over.
 *
 * Unrelated to `notes`, which is the per-song comment thread.
 */

export type NoteLinkKind =
  | 'song'
  | 'event'
  | 'venue'
  | 'setlist'
  | 'poll'
  | 'other';

export interface NoteLink {
  id: string;
  kind: NoteLinkKind;
  /** The linked row's id; null for `other`. */
  targetId: string | null;
  /** Free-form destination for `other`. */
  url: string | null;
  /**
   * The target's name as it read when the link was made. Kept as written so a
   * link stays legible after its target is renamed or deleted — following it
   * lands on the live thing, which is where the current name lives.
   */
  label: string;
}

export interface UserNote {
  id: string;
  bandId: string;
  authorId: string;
  authorName: string | null;
  title: string;
  body: string | null;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  links: NoteLink[];
}

/** A link as submitted by the client, before it gets an id. */
export interface NoteLinkInput {
  kind: NoteLinkKind;
  targetId: string | null;
  url: string | null;
  label: string;
}

/** Attach each note's links, in one query for the whole page. */
async function withLinks(rows: Omit<UserNote, 'links'>[]): Promise<UserNote[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(userNoteLinks)
    .where(
      inArray(
        userNoteLinks.noteId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(userNoteLinks.position));

  const byNote = new Map<string, NoteLink[]>();
  for (const l of links) {
    const list = byNote.get(l.noteId) ?? [];
    list.push({
      id: l.id,
      kind: l.kind,
      targetId: l.targetId,
      url: l.url,
      label: l.label,
    });
    byNote.set(l.noteId, list);
  }
  return rows.map((r) => ({ ...r, links: byNote.get(r.id) ?? [] }));
}

const NOTE_COLUMNS = {
  id: userNotes.id,
  bandId: userNotes.bandId,
  authorId: userNotes.authorId,
  authorName: users.name,
  title: userNotes.title,
  body: userNotes.body,
  shared: userNotes.shared,
  createdAt: userNotes.createdAt,
  updatedAt: userNotes.updatedAt,
};

/** Serialize the timestamps the columns above return as Dates. */
function toNote(row: {
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
}): Omit<UserNote, 'links'> {
  return {
    ...(row as unknown as Omit<UserNote, 'links' | 'createdAt' | 'updatedAt'>),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Which slice of a band's notes to list.
 *
 * `personal` and `shared` partition what a member can see: a note is in
 * exactly one of them, and sharing one moves it across. Nothing is in both,
 * which is what lets the two views be read as "mine" and "the band's" rather
 * than as overlapping filters.
 */
export type NoteScope = 'all' | 'personal' | 'shared';

/**
 * What `userId` can see in this band, most recently updated first: their own
 * notes plus everyone's shared ones, narrowed by `scope`. The caller must
 * already have confirmed band membership.
 *
 * Every scope stays inside that visibility rule — `shared` is band-wide by
 * definition and `personal` is the caller's own — so narrowing can't widen
 * what a member is allowed to read.
 */
export async function listBandNotesForUser(
  bandId: string,
  userId: string,
  window?: { limit: number; offset: number },
  scope: NoteScope = 'all',
): Promise<UserNote[]> {
  const visible =
    scope === 'personal'
      ? and(eq(userNotes.authorId, userId), eq(userNotes.shared, false))
      : scope === 'shared'
        ? eq(userNotes.shared, true)
        : or(eq(userNotes.authorId, userId), eq(userNotes.shared, true));
  const rows = await db
    .select(NOTE_COLUMNS)
    .from(userNotes)
    .innerJoin(users, eq(users.id, userNotes.authorId))
    .where(and(eq(userNotes.bandId, bandId), visible))
    .orderBy(desc(userNotes.updatedAt))
    .limit(window ? window.limit : Number.MAX_SAFE_INTEGER)
    .offset(window ? window.offset : 0);
  return withLinks(rows.map(toNote));
}

/**
 * One note, if `userId` may read it — theirs, or shared with their band. The
 * caller still checks band membership; this only enforces the note's own
 * visibility.
 */
export async function getNoteForUser(
  noteId: string,
  userId: string,
): Promise<UserNote | null> {
  const [row] = await db
    .select(NOTE_COLUMNS)
    .from(userNotes)
    .innerJoin(users, eq(users.id, userNotes.authorId))
    .where(eq(userNotes.id, noteId))
    .limit(1);
  if (!row) return null;
  if (row.authorId !== userId && !row.shared) return null;
  const [withIts] = await withLinks([toNote(row)]);
  return withIts ?? null;
}

/** The note's band and author, for authorizing a write without loading it. */
export async function getNoteOwnership(
  noteId: string,
): Promise<{ bandId: string; authorId: string } | null> {
  const [row] = await db
    .select({ bandId: userNotes.bandId, authorId: userNotes.authorId })
    .from(userNotes)
    .where(eq(userNotes.id, noteId))
    .limit(1);
  return row ?? null;
}

async function replaceLinks(
  noteId: string,
  links: NoteLinkInput[],
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
): Promise<void> {
  await exec.delete(userNoteLinks).where(eq(userNoteLinks.noteId, noteId));
  if (links.length === 0) return;
  await exec.insert(userNoteLinks).values(
    links.map((l, i) => ({
      noteId,
      kind: l.kind,
      targetId: l.targetId,
      url: l.url,
      label: l.label,
      position: i,
    })),
  );
}

export async function createNote(input: {
  bandId: string;
  authorId: string;
  title: string;
  body: string | null;
  shared: boolean;
  links: NoteLinkInput[];
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(userNotes)
      .values({
        bandId: input.bandId,
        authorId: input.authorId,
        title: input.title,
        body: input.body,
        shared: input.shared,
      })
      .returning({ id: userNotes.id });
    await replaceLinks(row!.id, input.links, tx);
    return row!;
  });
}

/** Overwrite a note's fields and its whole link list. Author-only (checked by the caller). */
export async function updateNote(
  noteId: string,
  fields: {
    title: string;
    body: string | null;
    shared: boolean;
    links: NoteLinkInput[];
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(userNotes)
      .set({
        title: fields.title,
        body: fields.body,
        shared: fields.shared,
        updatedAt: sql`now()`,
      })
      .where(eq(userNotes.id, noteId));
    await replaceLinks(noteId, fields.links, tx);
  });
}

/** Delete a note; its links cascade. */
export async function deleteNote(noteId: string): Promise<void> {
  await db.delete(userNotes).where(eq(userNotes.id, noteId));
}
