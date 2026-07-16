import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from './index';
import { conversations, setlists, setlistSongs, songFiles } from './schema';

/**
 * Setlists — named, ordered lists of a band's songs. Access is scoped to
 * the owning band's membership (enforced by the routes). A conversation
 * appears at most once per setlist; order is stored as `position`.
 */

export type Setlist = typeof setlists.$inferSelect;

export interface SetlistSong {
  /** setlist_songs row id — stable identity, incl. for non-song markers. */
  id: string;
  /** Null for non-song items (set break / custom marker). */
  conversationId: string | null;
  /** Display name: the song's file name, or the marker's label. */
  name: string;
  /** Audio duration in whole seconds; null for markers / unknown. */
  songLength: number | null;
}

/** One item to persist: a song (conversationId) or a marker (label). */
export interface SetlistItemInput {
  conversationId: string | null;
  label: string | null;
}

function resolveName(audioFileName: string | null, label: string | null): string {
  return audioFileName ?? label ?? 'Untitled';
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

  const rows = await db
    .select({
      id: setlistSongs.id,
      conversationId: setlistSongs.conversationId,
      audioFileName: conversations.audioFileName,
      label: setlistSongs.label,
      songLength: songFiles.songLength,
    })
    .from(setlistSongs)
    // Left join: marker items have no conversation.
    .leftJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    .leftJoin(
      songFiles,
      and(
        eq(songFiles.conversationId, setlistSongs.conversationId),
        eq(songFiles.kind, 'audio'),
        // Match only the default version, else a multi-version song would
        // appear once per version.
        eq(songFiles.isDefault, true),
      ),
    )
    .where(eq(setlistSongs.setlistId, setlistId))
    .orderBy(setlistSongs.position);

  const songs: SetlistSong[] = rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    name: resolveName(r.audioFileName, r.label),
    songLength: r.songLength,
  }));
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
 * Set a setlist's items to exactly `items`, in that order — songs and/or
 * markers (set break / custom). The caller validates that song ids belong
 * to the band. Replaces the rows wholesale in one transaction.
 */
export async function setSetlistSongs(
  setlistId: string,
  items: SetlistItemInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(setlistSongs).where(eq(setlistSongs.setlistId, setlistId));
    if (items.length > 0) {
      await tx.insert(setlistSongs).values(
        items.map((it, position) => ({
          setlistId,
          conversationId: it.conversationId,
          // Markers carry a label; songs never do.
          label: it.conversationId ? null : it.label,
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

/** Just the id + name of a band's setlists (newest first) — for pickers. */
export async function listBandSetlistNames(
  bandId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: setlists.id, name: setlists.name })
    .from(setlists)
    .where(eq(setlists.bandId, bandId))
    .orderBy(desc(setlists.updatedAt));
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
  const rows = await db
    .select({
      setlistId: setlistSongs.setlistId,
      id: setlistSongs.id,
      conversationId: setlistSongs.conversationId,
      audioFileName: conversations.audioFileName,
      label: setlistSongs.label,
      songLength: songFiles.songLength,
    })
    .from(setlistSongs)
    // Left join: marker items have no conversation.
    .leftJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    .leftJoin(
      songFiles,
      and(
        eq(songFiles.conversationId, setlistSongs.conversationId),
        eq(songFiles.kind, 'audio'),
        // Default version only — otherwise a multi-version song duplicates.
        eq(songFiles.isDefault, true),
      ),
    )
    .where(inArray(setlistSongs.setlistId, ids))
    .orderBy(setlistSongs.position);

  const byList = new Map<string, SetlistSong[]>();
  for (const s of rows) {
    const arr = byList.get(s.setlistId) ?? [];
    arr.push({
      id: s.id,
      conversationId: s.conversationId,
      name: resolveName(s.audioFileName, s.label),
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

export interface PracticeSong {
  conversationId: string;
  title: string;
  mimeType: string;
  sheetMusic: { fileName: string; mimeType: string; updatedAt: string } | null;
}

/**
 * A setlist's songs, in order, enriched for the Practice view: each song's
 * audio MIME type and its sheet-music metadata (if any). Two queries — the
 * ordered songs, then a batched lookup of their audio/sheet file rows.
 */
export async function getSetlistPracticeSongs(
  setlistId: string,
): Promise<PracticeSong[]> {
  const rawRows = await db
    .select({
      conversationId: setlistSongs.conversationId,
      audioFileName: conversations.audioFileName,
    })
    .from(setlistSongs)
    .innerJoin(conversations, eq(conversations.id, setlistSongs.conversationId))
    // Markers (no conversation) aren't playable — Practice steps songs only.
    .where(
      and(
        eq(setlistSongs.setlistId, setlistId),
        isNotNull(setlistSongs.conversationId),
      ),
    )
    .orderBy(asc(setlistSongs.position));
  // The isNotNull filter guarantees a conversation id; narrow the type.
  const rows = rawRows.filter(
    (r): r is { conversationId: string; audioFileName: string | null } =>
      r.conversationId !== null,
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.conversationId);
  const files = await db
    .select({
      conversationId: songFiles.conversationId,
      kind: songFiles.kind,
      isDefault: songFiles.isDefault,
      fileName: songFiles.fileName,
      mimeType: songFiles.mimeType,
      updatedAt: songFiles.updatedAt,
    })
    .from(songFiles)
    .where(inArray(songFiles.conversationId, ids));

  const audioByConv = new Map<string, (typeof files)[number]>();
  const sheetByConv = new Map<string, (typeof files)[number]>();
  for (const f of files) {
    // A song can have several audio versions; use the default one.
    if (f.kind === 'audio' && f.isDefault) audioByConv.set(f.conversationId, f);
    else if (f.kind === 'sheet_music') sheetByConv.set(f.conversationId, f);
  }

  return rows.map((r) => {
    const audio = audioByConv.get(r.conversationId);
    const sheet = sheetByConv.get(r.conversationId);
    return {
      conversationId: r.conversationId,
      title: r.audioFileName ?? audio?.fileName ?? 'Untitled audio',
      mimeType: audio?.mimeType ?? 'audio/mpeg',
      sheetMusic: sheet
        ? {
            fileName: sheet.fileName,
            mimeType: sheet.mimeType,
            updatedAt: sheet.updatedAt.toISOString(),
          }
        : null,
    };
  });
}
