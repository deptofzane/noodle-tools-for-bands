import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index';
import { conversations, setlists, setlistSongs } from './schema';

/**
 * Setlists — named, ordered lists of a band's songs. Access is scoped to
 * the owning band's membership (enforced by the routes). A conversation
 * appears at most once per setlist; order is stored as `position`.
 */

export type Setlist = typeof setlists.$inferSelect;

export interface SetlistSong {
  conversationId: string;
  audioFileName: string | null;
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
    })
    .from(setlistSongs)
    .innerJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    .where(eq(setlistSongs.setlistId, setlistId))
    .orderBy(setlistSongs.position);

  return { id: row.id, bandId: row.bandId, name: row.name, songs };
}

/**
 * Persist a new song order for a setlist. `conversationIds` must be a
 * permutation of the setlist's current songs (validated by the caller);
 * each row's position is set to its index, and the setlist is touched.
 */
export async function setSetlistOrder(
  setlistId: string,
  conversationIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < conversationIds.length; i++) {
      await tx
        .update(setlistSongs)
        .set({ position: i })
        .where(
          and(
            eq(setlistSongs.setlistId, setlistId),
            eq(setlistSongs.conversationId, conversationIds[i]!),
          ),
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
    })
    .from(setlistSongs)
    .innerJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    .where(inArray(setlistSongs.setlistId, ids))
    .orderBy(setlistSongs.position);

  const byList = new Map<string, SetlistSong[]>();
  for (const s of songs) {
    const arr = byList.get(s.setlistId) ?? [];
    arr.push({ conversationId: s.conversationId, audioFileName: s.audioFileName });
    byList.set(s.setlistId, arr);
  }

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    updatedAt: l.updatedAt.toISOString(),
    songs: byList.get(l.id) ?? [],
  }));
}
