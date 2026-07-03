import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index';
import { conversations, setlists, setlistSongs, songFiles } from './schema';

/**
 * Setlists — named, ordered lists of a band's songs. Access is scoped to
 * the owning band's membership (enforced by the routes). A conversation
 * appears at most once per setlist; order is stored as `position`.
 */

export type Setlist = typeof setlists.$inferSelect;

export interface SetlistSong {
  conversationId: string;
  audioFileName: string | null;
  /** Audio duration in whole seconds; null if unknown. */
  songLength: number | null;
}

export interface SetlistWithSongs {
  id: string;
  name: string;
  updatedAt: string;
  songs: SetlistSong[];
}

export interface SetlistDetail {
  id: string;
  bandId: string;
  name: string;
  songs: SetlistSong[];
}

/** Create a setlist and its ordered songs in one transaction. */
export async function createSetlist(input: {
  bandId: string;
  createdBy: string;
  name: string;
  conversationIds: string[];
}): Promise<Setlist> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(setlists)
      .values({
        bandId: input.bandId,
        name: input.name,
        createdBy: input.createdBy,
      })
      .returning();
    if (input.conversationIds.length > 0) {
      await tx.insert(setlistSongs).values(
        input.conversationIds.map((conversationId, position) => ({
          setlistId: row!.id,
          conversationId,
          position,
        })),
      );
    }
    return row!;
  });
}

/** A single setlist with its ordered songs, or null if it doesn't exist. */
export async function getSetlist(
  setlistId: string,
): Promise<SetlistDetail | null> {
  const [row] = await db
    .select()
    .from(setlists)
    .where(eq(setlists.id, setlistId))
    .limit(1);
  if (!row) return null;

  const songs = await db
    .select({
      conversationId: setlistSongs.conversationId,
      audioFileName: conversations.audioFileName,
      songLength: songFiles.songLength,
    })
    .from(setlistSongs)
    .innerJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    .leftJoin(
      songFiles,
      and(
        eq(songFiles.conversationId, setlistSongs.conversationId),
        eq(songFiles.kind, 'audio'),
      ),
    )
    .where(eq(setlistSongs.setlistId, setlistId))
    .orderBy(setlistSongs.position);

  return { id: row.id, bandId: row.bandId, name: row.name, songs };
}

/**
 * Append a song to a setlist (idempotent — a repeat is a no-op via the
 * primary key). Position is one past the current max. Touches the setlist.
 */
export async function addSongToSetlist(
  setlistId: string,
  conversationId: string,
): Promise<void> {
  const rows = await db
    .select({ position: setlistSongs.position })
    .from(setlistSongs)
    .where(eq(setlistSongs.setlistId, setlistId));
  const nextPosition = rows.length
    ? Math.max(...rows.map((r) => r.position)) + 1
    : 0;
  await db
    .insert(setlistSongs)
    .values({ setlistId, conversationId, position: nextPosition })
    .onConflictDoNothing();
  await db
    .update(setlists)
    .set({ updatedAt: new Date() })
    .where(eq(setlists.id, setlistId));
}

/**
 * Set a setlist's songs to exactly `conversationIds`, in that order —
 * adding, removing, and repositioning as needed. The caller validates the
 * ids belong to the band. Replaces the rows wholesale in one transaction.
 */
export async function setSetlistSongs(
  setlistId: string,
  conversationIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(setlistSongs).where(eq(setlistSongs.setlistId, setlistId));
    if (conversationIds.length > 0) {
      await tx.insert(setlistSongs).values(
        conversationIds.map((conversationId, position) => ({
          setlistId,
          conversationId,
          position,
        })),
      );
    }
    await tx
      .update(setlists)
      .set({ updatedAt: new Date() })
      .where(eq(setlists.id, setlistId));
  });
}

/** Setlists in a band (newest first), each with its ordered songs. */
export async function listBandSetlists(
  bandId: string,
): Promise<SetlistWithSongs[]> {
  const lists = await db
    .select()
    .from(setlists)
    .where(eq(setlists.bandId, bandId))
    .orderBy(desc(setlists.updatedAt));
  if (lists.length === 0) return [];

  const ids = lists.map((l) => l.id);
  const songs = await db
    .select({
      setlistId: setlistSongs.setlistId,
      conversationId: setlistSongs.conversationId,
      audioFileName: conversations.audioFileName,
      songLength: songFiles.songLength,
    })
    .from(setlistSongs)
    .innerJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    .leftJoin(
      songFiles,
      and(
        eq(songFiles.conversationId, setlistSongs.conversationId),
        eq(songFiles.kind, 'audio'),
      ),
    )
    .where(inArray(setlistSongs.setlistId, ids))
    .orderBy(setlistSongs.position);

  const byList = new Map<string, SetlistSong[]>();
  for (const s of songs) {
    const arr = byList.get(s.setlistId) ?? [];
    arr.push({
      conversationId: s.conversationId,
      audioFileName: s.audioFileName,
      songLength: s.songLength,
    });
    byList.set(s.setlistId, arr);
  }

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    updatedAt: l.updatedAt.toISOString(),
    songs: byList.get(l.id) ?? [],
  }));
}
