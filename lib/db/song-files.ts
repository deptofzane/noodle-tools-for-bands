import { and, eq } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { db } from './index';
import { conversations, songFiles } from './schema';
import { getBucket, getS3Client, songFileKey } from '../storage/s3';

/**
 * Song file storage.
 *
 * Bytes live in S3-compatible object storage (Cloudflare R2 in prod,
 * MinIO in dev); Postgres holds only the metadata + the object key. This
 * keeps the database small regardless of the audio library's size.
 *
 * Object writes and DB rows aren't a single transaction, so cleanup is
 * best-effort with a bias toward orphaned OBJECTS over dangling rows:
 * deletes drop the row first, then the object (a leaked object is caught
 * by the sweep script; a row pointing at a missing object is worse).
 */

export type SongFileKind = (typeof songFiles.kind.enumValues)[number];

export interface SongFileMeta {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Audio duration in whole seconds; null for non-audio / unknown. */
  songLength: number | null;
  /** ISO timestamp of the last write — a stable cache-bust token. */
  updatedAt: string;
}

/**
 * Parse an audio buffer's duration (whole seconds) via music-metadata.
 * Best-effort — returns null on any failure so a bad/odd file never
 * blocks the upload.
 */
async function parseAudioDurationSeconds(
  data: Buffer,
  mimeType: string,
): Promise<number | null> {
  try {
    const { parseBuffer } = await import('music-metadata');
    const meta = await parseBuffer(data, { mimeType });
    const dur = meta.format.duration;
    return typeof dur === 'number' && Number.isFinite(dur)
      ? Math.round(dur)
      : null;
  } catch {
    return null;
  }
}

async function getRow(conversationId: string, kind: SongFileKind) {
  const [row] = await db
    .select({
      storageKey: songFiles.storageKey,
      fileName: songFiles.fileName,
      mimeType: songFiles.mimeType,
      sizeBytes: songFiles.sizeBytes,
      songLength: songFiles.songLength,
      updatedAt: songFiles.updatedAt,
    })
    .from(songFiles)
    .where(
      and(eq(songFiles.conversationId, conversationId), eq(songFiles.kind, kind)),
    )
    .limit(1);
  return row ?? null;
}

export async function getSongFileMeta(
  conversationId: string,
  kind: SongFileKind,
): Promise<SongFileMeta | null> {
  const row = await getRow(conversationId, kind);
  if (!row) return null;
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    songLength: row.songLength,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function hasSongFile(
  conversationId: string,
  kind: SongFileKind,
): Promise<boolean> {
  return (await getSongFileMeta(conversationId, kind)) !== null;
}

/** Upload (or replace) the file's bytes in object storage + upsert its row. */
export async function putSongFile(input: {
  conversationId: string;
  kind: SongFileKind;
  data: Buffer;
  fileName: string;
  mimeType: string;
  driveFileId?: string | null;
}): Promise<SongFileMeta> {
  const key = songFileKey(input.conversationId, input.kind);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: input.data,
      ContentType: input.mimeType,
      ContentLength: input.data.length,
    }),
  );

  // Audio duration is derived automatically from the bytes on upload.
  const songLength =
    input.kind === 'audio'
      ? await parseAudioDurationSeconds(input.data, input.mimeType)
      : null;

  const now = new Date();
  const [row] = await db
    .insert(songFiles)
    .values({
      conversationId: input.conversationId,
      kind: input.kind,
      storageKey: key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      songLength,
      driveFileId: input.driveFileId ?? null,
    })
    .onConflictDoUpdate({
      target: [songFiles.conversationId, songFiles.kind],
      set: {
        storageKey: key,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        songLength,
        driveFileId: input.driveFileId ?? null,
        updatedAt: now,
      },
    })
    .returning({
      fileName: songFiles.fileName,
      mimeType: songFiles.mimeType,
      sizeBytes: songFiles.sizeBytes,
      songLength: songFiles.songLength,
      updatedAt: songFiles.updatedAt,
    });
  return { ...row!, updatedAt: row!.updatedAt.toISOString() };
}

export interface SongFileStream {
  body: Readable;
  status: 200 | 206;
  contentLength?: number;
  /** Present for partial responses. */
  contentRange?: string;
}

/**
 * Fetch the bytes from object storage, honoring an HTTP Range header (the
 * store computes the range and returns 206 + Content-Range). Returns null
 * if the file doesn't exist. Throws on a Range the store can't satisfy —
 * the route maps that to 416.
 */
export async function streamSongFile(
  conversationId: string,
  kind: SongFileKind,
  rangeHeader?: string,
): Promise<SongFileStream | null> {
  const row = await getRow(conversationId, kind);
  if (!row?.storageKey) return null;

  const res = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: row.storageKey,
      Range: rangeHeader,
    }),
  );
  const contentRange = res.ContentRange ?? undefined;
  return {
    body: res.Body as Readable,
    status: contentRange ? 206 : 200,
    contentLength:
      typeof res.ContentLength === 'number' ? res.ContentLength : undefined,
    contentRange,
  };
}

export async function deleteSongFile(
  conversationId: string,
  kind: SongFileKind,
): Promise<void> {
  const row = await getRow(conversationId, kind);
  await db
    .delete(songFiles)
    .where(
      and(eq(songFiles.conversationId, conversationId), eq(songFiles.kind, kind)),
    );
  if (row?.storageKey) await deleteObjects([row.storageKey]);
}

/** Object keys for one conversation (for cascade cleanup before a DB delete). */
export async function storageKeysForConversation(
  conversationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ key: songFiles.storageKey })
    .from(songFiles)
    .where(eq(songFiles.conversationId, conversationId));
  return rows.map((r) => r.key).filter((k): k is string => Boolean(k));
}

/** Object keys for every conversation in a band. */
export async function storageKeysForBand(bandId: string): Promise<string[]> {
  const rows = await db
    .select({ key: songFiles.storageKey })
    .from(songFiles)
    .innerJoin(conversations, eq(conversations.id, songFiles.conversationId))
    .where(eq(conversations.bandId, bandId));
  return rows.map((r) => r.key).filter((k): k is string => Boolean(k));
}

/** Best-effort delete of objects from storage (used after a cascade delete). */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: getBucket(),
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  } catch (err) {
    console.error('[song-files] batch object delete failed', err);
  }
}
