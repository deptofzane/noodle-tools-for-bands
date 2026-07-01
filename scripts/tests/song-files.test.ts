import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, songFiles, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { createBand, deleteBand } from '../../lib/db/bands';
import { findOrCreateConversation } from '../../lib/db/conversations';
import {
  deleteSongFile,
  getSongFileMeta,
  hasSongFile,
  putSongFile,
  streamSongFile,
} from '../../lib/db/song-files';
import { closeObjectStore } from '../../lib/storage/s3';

after(() => {
  closeObjectStore();
  return closeDb();
});

async function streamToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of readable) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
  }
  return Buffer.concat(chunks);
}

test('song-files: object-store round-trip, range, upsert, cascade', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'SF_OWNER', email: 'o@x.com', name: 'O' });
    const band = await createBand(owner.id, 'SF Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(band.id, 'driveSF', 'Song.mp3');

    const data = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    const putMeta = await putSongFile({
      conversationId: conv.id,
      kind: 'audio',
      data,
      fileName: 'Song.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'driveSF',
    });
    assert.ok(typeof putMeta.updatedAt === 'string', 'putSongFile returns meta with updatedAt');

    assert.ok(await hasSongFile(conv.id, 'audio'), 'hasSongFile true');
    const meta = await getSongFileMeta(conv.id, 'audio');
    assert.equal(meta?.sizeBytes, 1024, 'size 1024');
    assert.equal(meta?.mimeType, 'audio/mpeg', 'mime stored');
    assert.ok(typeof meta?.updatedAt === 'string', 'meta includes updatedAt');

    // full read round-trips
    const full = await streamSongFile(conv.id, 'audio');
    assert.equal(full?.status, 200, 'full read is 200');
    assert.ok(full && (await streamToBuffer(full.body)).equals(data), 'full read matches');

    // range slice → 206 + Content-Range
    const mid = await streamSongFile(conv.id, 'audio', 'bytes=100-149');
    assert.equal(mid?.status, 206, 'range read is 206');
    assert.ok(mid?.contentRange?.startsWith('bytes 100-149/'), 'content-range set');
    assert.ok(mid && (await streamToBuffer(mid.body)).equals(data.subarray(100, 150)), 'mid slice matches');

    const tail = await streamSongFile(conv.id, 'audio', 'bytes=1000-');
    assert.ok(tail && (await streamToBuffer(tail.body)).equals(data.subarray(1000, 1024)), 'tail slice matches');

    // upsert replaces
    const data2 = Buffer.from('hello world', 'utf8');
    await putSongFile({
      conversationId: conv.id,
      kind: 'audio',
      data: data2,
      fileName: 'New.wav',
      mimeType: 'audio/wav',
    });
    const meta2 = await getSongFileMeta(conv.id, 'audio');
    assert.ok(meta2?.sizeBytes === data2.length && meta2?.fileName === 'New.wav', 'upsert replaces the row');
    assert.equal(
      (await db.select().from(songFiles).where(eq(songFiles.conversationId, conv.id))).length,
      1,
      'single row per (conversation, kind)',
    );

    // sheet music coexists with audio
    await putSongFile({
      conversationId: conv.id,
      kind: 'sheet_music',
      data: Buffer.from('%PDF-1.4 fake', 'utf8'),
      fileName: 'score.pdf',
      mimeType: 'application/pdf',
    });
    assert.equal(
      (await db.select().from(songFiles).where(eq(songFiles.conversationId, conv.id))).length,
      2,
      'two rows: audio + sheet music',
    );
    await deleteSongFile(conv.id, 'sheet_music');
    assert.ok(!(await hasSongFile(conv.id, 'sheet_music')), 'sheet music removed');
    assert.ok(await hasSongFile(conv.id, 'audio'), 'removing sheet music leaves audio');

    // deleteBand cascades the rows and cleans up the objects
    await deleteBand(band.id);
    bandId = undefined;
    assert.equal(
      (await db.select().from(songFiles).where(eq(songFiles.conversationId, conv.id))).length,
      0,
      'cascade delete on band removal',
    );
    assert.equal(await streamSongFile(conv.id, 'audio'), null, 'object no longer served');
  } finally {
    if (bandId) await deleteBand(bandId);
    await db.delete(users).where(eq(users.googleSub, 'SF_OWNER'));
  }
});
