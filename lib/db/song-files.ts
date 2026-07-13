import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { db } from './index';
import { conversations, songFiles } from './schema';
import {
  audioVersionKey,
  getBucket,
  getS3Client,
  songFileKey,
} from '../storage/s3';

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

// Guard version ids before they hit a `uuid`-typed column: a malformed id
// would make Postgres throw ("invalid input syntax for type uuid") rather
// than simply miss, turning a not-found into a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

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

// Resolve the "current" row for a (conversation, kind). Sheet music has at
// most one row; audio may have several versions, so we resolve to the
// default — that's what the player and metadata reads target.
async function getRow(conversationId: string, kind: SongFileKind) {
  const where =
    kind === 'audio'
      ? and(
          eq(songFiles.conversationId, conversationId),
          eq(songFiles.kind, 'audio'),
          eq(songFiles.isDefault, true),
        )
      : and(
          eq(songFiles.conversationId, conversationId),
          eq(songFiles.kind, kind),
        );
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
    .where(where)
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

const META_COLUMNS = {
  fileName: songFiles.fileName,
  mimeType: songFiles.mimeType,
  sizeBytes: songFiles.sizeBytes,
  songLength: songFiles.songLength,
  updatedAt: songFiles.updatedAt,
} as const;

/**
 * Upload (or replace) the single sheet-music file for a song. One row per
 * conversation: an existing row is overwritten in place (same object key),
 * otherwise a new one is inserted.
 */
export async function putSheetMusic(input: {
  conversationId: string;
  data: Buffer;
  fileName: string;
  mimeType: string;
  driveFileId?: string | null;
}): Promise<SongFileMeta> {
  const key = songFileKey(input.conversationId, 'sheet_music');
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: input.data,
      ContentType: input.mimeType,
      ContentLength: input.data.length,
    }),
  );

  const now = new Date();
  const values = {
    storageKey: key,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.data.length,
    songLength: null,
    driveFileId: input.driveFileId ?? null,
    updatedAt: now,
  };

  const [updated] = await db
    .update(songFiles)
    .set(values)
    .where(
      and(
        eq(songFiles.conversationId, input.conversationId),
        eq(songFiles.kind, 'sheet_music'),
      ),
    )
    .returning(META_COLUMNS);
  if (updated) return { ...updated, updatedAt: updated.updatedAt.toISOString() };

  const [inserted] = await db
    .insert(songFiles)
    .values({
      conversationId: input.conversationId,
      kind: 'sheet_music',
      ...values,
    })
    .returning(META_COLUMNS);
  return { ...inserted!, updatedAt: inserted!.updatedAt.toISOString() };
}

export interface AudioVersion {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  songLength: number | null;
  isDefault: boolean;
  label: string | null;
  updatedAt: string;
}

/**
 * Add a new audio version to a song. The first audio version for a
 * conversation automatically becomes the default; subsequent ones don't.
 * Runs the "is this the first?" check and the insert in one transaction so
 * the default flag stays consistent with the partial unique index.
 */
export async function addAudioVersion(input: {
  conversationId: string;
  data: Buffer;
  fileName: string;
  mimeType: string;
  label?: string | null;
  driveFileId?: string | null;
}): Promise<AudioVersion> {
  const key = audioVersionKey(input.conversationId, randomUUID());
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: input.data,
      ContentType: input.mimeType,
      ContentLength: input.data.length,
    }),
  );
  const songLength = await parseAudioDurationSeconds(input.data, input.mimeType);

  const row = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: songFiles.id })
      .from(songFiles)
      .where(
        and(
          eq(songFiles.conversationId, input.conversationId),
          eq(songFiles.kind, 'audio'),
          eq(songFiles.isDefault, true),
        ),
      )
      .limit(1);
    const isDefault = existing.length === 0;

    const [inserted] = await tx
      .insert(songFiles)
      .values({
        conversationId: input.conversationId,
        kind: 'audio',
        storageKey: key,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        songLength,
        isDefault,
        label: input.label ?? null,
        driveFileId: input.driveFileId ?? null,
      })
      .returning({
        id: songFiles.id,
        fileName: songFiles.fileName,
        mimeType: songFiles.mimeType,
        sizeBytes: songFiles.sizeBytes,
        songLength: songFiles.songLength,
        isDefault: songFiles.isDefault,
        label: songFiles.label,
        updatedAt: songFiles.updatedAt,
      });
    return inserted!;
  });

  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

/** All audio versions for a song, default first, then oldest → newest. */
export async function listAudioVersions(
  conversationId: string,
): Promise<AudioVersion[]> {
  const rows = await db
    .select({
      id: songFiles.id,
      fileName: songFiles.fileName,
      mimeType: songFiles.mimeType,
      sizeBytes: songFiles.sizeBytes,
      songLength: songFiles.songLength,
      isDefault: songFiles.isDefault,
      label: songFiles.label,
      updatedAt: songFiles.updatedAt,
    })
    .from(songFiles)
    .where(
      and(
        eq(songFiles.conversationId, conversationId),
        eq(songFiles.kind, 'audio'),
      ),
    )
    .orderBy(desc(songFiles.isDefault), asc(songFiles.createdAt));
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

/** Metadata for one specific audio version (scoped to its conversation). */
export async function getAudioVersionMeta(
  conversationId: string,
  versionId: string,
): Promise<SongFileMeta | null> {
  if (!isUuid(versionId)) return null;
  const [row] = await db
    .select(META_COLUMNS)
    .from(songFiles)
    .where(
      and(
        eq(songFiles.id, versionId),
        eq(songFiles.conversationId, conversationId),
        eq(songFiles.kind, 'audio'),
      ),
    )
    .limit(1);
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
}

/**
 * Make `versionId` the default audio for its song. Clears the existing
 * default first (so there's never two) then sets the new one, in a single
 * transaction. Returns false if the version doesn't exist for this song.
 */
export async function setDefaultAudioVersion(
  conversationId: string,
  versionId: string,
): Promise<boolean> {
  if (!isUuid(versionId)) return false;
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: songFiles.id })
      .from(songFiles)
      .where(
        and(
          eq(songFiles.id, versionId),
          eq(songFiles.conversationId, conversationId),
          eq(songFiles.kind, 'audio'),
        ),
      )
      .limit(1);
    if (!target) return false;

    await tx
      .update(songFiles)
      .set({ isDefault: false })
      .where(
        and(
          eq(songFiles.conversationId, conversationId),
          eq(songFiles.kind, 'audio'),
          eq(songFiles.isDefault, true),
        ),
      );
    await tx
      .update(songFiles)
      .set({ isDefault: true })
      .where(eq(songFiles.id, versionId));
    return true;
  });
}

/**
 * Delete one audio version. If it was the default and other versions
 * remain, the newest remaining version is promoted to default. Returns
 * null if the version doesn't exist for this song, otherwise the id of the
 * new default (or null if none remain).
 */
export async function deleteAudioVersion(
  conversationId: string,
  versionId: string,
): Promise<{ newDefaultId: string | null } | null> {
  if (!isUuid(versionId)) return null;
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: songFiles.id,
        storageKey: songFiles.storageKey,
        isDefault: songFiles.isDefault,
      })
      .from(songFiles)
      .where(
        and(
          eq(songFiles.id, versionId),
          eq(songFiles.conversationId, conversationId),
          eq(songFiles.kind, 'audio'),
        ),
      )
      .limit(1);
    if (!row) return null;

    await tx.delete(songFiles).where(eq(songFiles.id, versionId));

    let newDefaultId: string | null = null;
    if (row.isDefault) {
      const [next] = await tx
        .select({ id: songFiles.id })
        .from(songFiles)
        .where(
          and(
            eq(songFiles.conversationId, conversationId),
            eq(songFiles.kind, 'audio'),
          ),
        )
        .orderBy(desc(songFiles.createdAt))
        .limit(1);
      if (next) {
        await tx
          .update(songFiles)
          .set({ isDefault: true })
          .where(eq(songFiles.id, next.id));
        newDefaultId = next.id;
      }
    }
    return { storageKey: row.storageKey, newDefaultId };
  });

  if (!result) return null;
  if (result.storageKey) await deleteObjects([result.storageKey]);
  return { newDefaultId: result.newDefaultId };
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
async function streamKey(
  storageKey: string,
  rangeHeader?: string,
): Promise<SongFileStream> {
  const res = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: storageKey,
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

export async function streamSongFile(
  conversationId: string,
  kind: SongFileKind,
  rangeHeader?: string,
): Promise<SongFileStream | null> {
  const row = await getRow(conversationId, kind);
  if (!row?.storageKey) return null;
  return streamKey(row.storageKey, rangeHeader);
}

/** Stream one specific audio version (scoped to its conversation). */
export async function streamAudioVersion(
  conversationId: string,
  versionId: string,
  rangeHeader?: string,
): Promise<SongFileStream | null> {
  if (!isUuid(versionId)) return null;
  const [row] = await db
    .select({ storageKey: songFiles.storageKey })
    .from(songFiles)
    .where(
      and(
        eq(songFiles.id, versionId),
        eq(songFiles.conversationId, conversationId),
        eq(songFiles.kind, 'audio'),
      ),
    )
    .limit(1);
  if (!row?.storageKey) return null;
  return streamKey(row.storageKey, rangeHeader);
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
