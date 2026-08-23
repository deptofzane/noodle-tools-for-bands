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
  /** Held at the top of its view. See `pinNote`. */
  pinned: boolean;
  /** When it was pinned; null when it isn't. Orders the pinned section. */
  pinnedAt: string | null;
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
  pinned: userNotes.pinned,
  pinnedAt: userNotes.pinnedAt,
  createdAt: userNotes.createdAt,
  updatedAt: userNotes.updatedAt,
};

/** Serialize the timestamps the columns above return as Dates. */
function toNote(row: {
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | null;
  [k: string]: unknown;
}): Omit<UserNote, 'links'> {
  return {
    ...(row as unknown as Omit<
      UserNote,
      'links' | 'createdAt' | 'updatedAt' | 'pinnedAt'
    >),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
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
 * What a scope may see, as a single predicate.
 *
 * Extracted because four queries now need it — the list, the pinned section,
 * its count, and the pin guard — and a visibility rule that gets restated per
 * call site is a rule that eventually gets restated wrong.
 */
function visibleIn(scope: NoteScope, userId: string) {
  return scope === 'personal'
    ? and(eq(userNotes.authorId, userId), eq(userNotes.shared, false))
    : scope === 'shared'
      ? eq(userNotes.shared, true)
      : or(eq(userNotes.authorId, userId), eq(userNotes.shared, true));
}

/**
 * What `userId` can see in this band, most recently updated first: their own
 * notes plus everyone's shared ones, narrowed by `scope`. The caller must
 * already have confirmed band membership.
 *
 * Every scope stays inside that visibility rule — `shared` is band-wide by
 * definition and `personal` is the caller's own — so narrowing can't widen
 * what a member is allowed to read.
 *
 * Pinned notes are *excluded*: they render in their own section above this
 * list, and showing them in both would repeat a note inside one view. That
 * also keeps the paging honest — a pinned note doesn't occupy a slot in a
 * page it isn't drawn in.
 */
export async function listBandNotesForUser(
  bandId: string,
  userId: string,
  window?: { limit: number; offset: number },
  scope: NoteScope = 'all',
): Promise<UserNote[]> {
  const rows = await db
    .select(NOTE_COLUMNS)
    .from(userNotes)
    .innerJoin(users, eq(users.id, userNotes.authorId))
    .where(
      and(
        eq(userNotes.bandId, bandId),
        visibleIn(scope, userId),
        eq(userNotes.pinned, false),
      ),
    )
    .orderBy(desc(userNotes.updatedAt))
    .limit(window ? window.limit : Number.MAX_SAFE_INTEGER)
    .offset(window ? window.offset : 0);
  return withLinks(rows.map(toNote));
}

/**
 * How many notes are pinned in this scope. Read straight off the partial
 * index, and shown on the "Load all" button so the count is the true total
 * rather than however many happen to be rendered.
 */
export async function countPinnedNotes(
  bandId: string,
  userId: string,
  scope: NoteScope = 'all',
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userNotes)
    .where(
      and(
        eq(userNotes.bandId, bandId),
        visibleIn(scope, userId),
        eq(userNotes.pinned, true),
      ),
    );
  return row?.n ?? 0;
}

/**
 * The pinned notes for a scope, newest pin first.
 *
 * `limit` is a display stop, not paging: the section shows the ten most
 * recent and "Load all" re-reads it without one. The ceiling on the unlimited
 * branch isn't a product rule — it's so a hand-crafted request can't ask for
 * an unbounded read.
 */
export const PINNED_PREVIEW = 10;
const PINNED_CEILING = 500;

export async function listPinnedNotes(
  bandId: string,
  userId: string,
  scope: NoteScope = 'all',
  limit?: number,
): Promise<UserNote[]> {
  const rows = await db
    .select(NOTE_COLUMNS)
    .from(userNotes)
    .innerJoin(users, eq(users.id, userNotes.authorId))
    .where(
      and(
        eq(userNotes.bandId, bandId),
        visibleIn(scope, userId),
        eq(userNotes.pinned, true),
      ),
    )
    // Matches the partial index, so this reads in order rather than sorting.
    .orderBy(desc(userNotes.pinnedAt))
    .limit(Math.min(limit ?? PINNED_CEILING, PINNED_CEILING));
  return withLinks(rows.map(toNote));
}

/**
 * Pin or unpin a note. Returns the updated row, or null if there's no such
 * note in this band.
 *
 * Deliberately leaves `updatedAt` alone. Pinning isn't editing: bumping it
 * would jump the note to the top of the main list the moment it's unpinned,
 * and would tell everyone the note "changed" when its text didn't.
 *
 * Authorization lives with the caller, which knows whether the actor is the
 * author (required for a private note) or merely a band member (enough for a
 * shared one).
 */
export async function setNotePinned(
  noteId: string,
  bandId: string,
  pinned: boolean,
): Promise<Omit<UserNote, 'links'> | null> {
  const [row] = await db
    .update(userNotes)
    .set({ pinned, pinnedAt: pinned ? new Date() : null })
    .where(and(eq(userNotes.id, noteId), eq(userNotes.bandId, bandId)))
    .returning({
      id: userNotes.id,
      bandId: userNotes.bandId,
      authorId: userNotes.authorId,
      title: userNotes.title,
      body: userNotes.body,
      shared: userNotes.shared,
      pinned: userNotes.pinned,
      pinnedAt: userNotes.pinnedAt,
      createdAt: userNotes.createdAt,
      updatedAt: userNotes.updatedAt,
    });
  if (!row) return null;
  return toNote({ ...row, authorName: null });
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

/**
 * What's needed to authorize a write without loading the whole note: its
 * band and author, plus the flags that decide who may pin it.
 */
export async function getNoteOwnership(noteId: string): Promise<{
  bandId: string;
  authorId: string;
  /** Pinning needs this: who may pin depends on who can see it. */
  shared: boolean;
  pinned: boolean;
  title: string;
} | null> {
  const [row] = await db
    .select({
      bandId: userNotes.bandId,
      authorId: userNotes.authorId,
      shared: userNotes.shared,
      pinned: userNotes.pinned,
      title: userNotes.title,
    })
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
    /**
     * Optional pin decision, applied in the same transaction as the edit.
     *
     * Only the share screen sends it, and only to answer "keep this pinned?"
     * as a note becomes shared. Doing it here rather than as a second request
     * means the note can't be briefly shared-and-still-pinned, which would
     * announce a pin the author had just declined.
     */
    pinned?: boolean;
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
        ...(fields.pinned === undefined
          ? {}
          : {
              pinned: fields.pinned,
              pinnedAt: fields.pinned ? new Date() : null,
            }),
      })
      .where(eq(userNotes.id, noteId));
    await replaceLinks(noteId, fields.links, tx);
  });
}

/** Delete a note; its links cascade. */
export async function deleteNote(noteId: string): Promise<void> {
  await db.delete(userNotes).where(eq(userNotes.id, noteId));
}
