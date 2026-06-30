import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { songFiles } from './schema';

/**
 * Song file storage (Postgres `bytea`).
 *
 * Files attached to a song/conversation — currently the audio, later
 * sheet music — are stored as binary in Postgres rather than referenced
 * in Drive. One row per (conversation, kind).
 *
 * This module is the storage backend behind a deliberately small
 * interface (`putSongFile` / `getSongFileMeta` / `readSongFileRange` /
 * `deleteSongFile`). If the library ever outgrows `bytea`, swapping to
 * object storage means reimplementing just these four functions — the
 * rest of the app only knows the interface.
 */

export type SongFileKind = (typeof songFiles.kind.enumValues)[number];

export interface SongFileMeta {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Metadata only (no bytes) — cheap; used to set up Range responses. */
export async function getSongFileMeta(
  conversationId: string,
  kind: SongFileKind,
): Promise<SongFileMeta | null> {
  const [row] = await db
    .select({
      fileName: songFiles.fileName,
      mimeType: songFiles.mimeType,
      sizeBytes: songFiles.sizeBytes,
    })
    .from(songFiles)
    .where(
      and(eq(songFiles.conversationId, conversationId), eq(songFiles.kind, kind)),
    )
    .limit(1);
  return row ?? null;
}

export async function hasSongFile(
  conversationId: string,
  kind: SongFileKind,
): Promise<boolean> {
  return (await getSongFileMeta(conversationId, kind)) !== null;
}

/** Insert or replace the file for a (conversation, kind). */
export async function putSongFile(input: {
  conversationId: string;
  kind: SongFileKind;
  data: Buffer;
  fileName: string;
  mimeType: string;
  driveFileId?: string | null;
}): Promise<void> {
  const values = {
    conversationId: input.conversationId,
    kind: input.kind,
    data: input.data,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.data.length,
    driveFileId: input.driveFileId ?? null,
  };
  await db
    .insert(songFiles)
    .values(values)
    .onConflictDoUpdate({
      target: [songFiles.conversationId, songFiles.kind],
      set: {
        data: values.data,
        fileName: values.fileName,
        mimeType: values.mimeType,
        sizeBytes: values.sizeBytes,
        driveFileId: values.driveFileId,
        updatedAt: new Date(),
      },
    });
}

/**
 * Read a byte slice without loading the whole file into the app: the
 * slice is extracted in Postgres via `substr` (1-indexed). Pass
 * `start = 0, length = sizeBytes` for the whole file. Returns null if
 * the row doesn't exist.
 */
export async function readSongFileRange(
  conversationId: string,
  kind: SongFileKind,
  start: number,
  length: number,
): Promise<Buffer | null> {
  const res = await db.execute<{ chunk: Buffer }>(sql`
    select substr(${songFiles.data}, ${start + 1}, ${length}) as chunk
    from ${songFiles}
    where ${songFiles.conversationId} = ${conversationId}
      and ${songFiles.kind} = ${kind}
    limit 1
  `);
  const row = res.rows[0];
  return row ? (row.chunk as Buffer) : null;
}

export async function deleteSongFile(
  conversationId: string,
  kind: SongFileKind,
): Promise<void> {
  await db
    .delete(songFiles)
    .where(
      and(eq(songFiles.conversationId, conversationId), eq(songFiles.kind, kind)),
    );
}
