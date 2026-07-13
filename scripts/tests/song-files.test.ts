import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { songFiles, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { createBand, deleteBand } from '../../lib/db/bands';
import { findOrCreateConversation } from '../../lib/db/conversations';
import {
  addAudioVersion,
  deleteAudioVersion,
  deleteSongFile,
  getAudioVersionMeta,
  getSongFileMeta,
  hasSongFile,
  listAudioVersions,
  putSheetMusic,
  setDefaultAudioVersion,
  streamAudioVersion,
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

test('song-files: object-store round-trip, range, default audio, cascade', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'SF_OWNER', email: 'o@x.com', name: 'O' });
    const band = await createBand(owner.id, 'SF Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(band.id, 'driveSF', 'Song.mp3');

    const data = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    const v1 = await addAudioVersion({
      conversationId: conv.id,
      data,
      fileName: 'Song.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'driveSF',
    });
    assert.ok(v1.isDefault, 'first version is the default');
    assert.ok(typeof v1.updatedAt === 'string', 'returns meta with updatedAt');

    assert.ok(await hasSongFile(conv.id, 'audio'), 'hasSongFile true');
    const meta = await getSongFileMeta(conv.id, 'audio');
    assert.equal(meta?.sizeBytes, 1024, 'size 1024');
    assert.equal(meta?.mimeType, 'audio/mpeg', 'mime stored');

    // full read of the default round-trips
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

    // sheet music coexists with (one) audio, one row per conversation
    await putSheetMusic({
      conversationId: conv.id,
      data: Buffer.from('%PDF-1.4 fake', 'utf8'),
      fileName: 'score.pdf',
      mimeType: 'application/pdf',
    });
    // replacing sheet music overwrites in place (still one row)
    await putSheetMusic({
      conversationId: conv.id,
      data: Buffer.from('%PDF-1.4 fake v2', 'utf8'),
      fileName: 'score2.pdf',
      mimeType: 'application/pdf',
    });
    assert.equal((await getSongFileMeta(conv.id, 'sheet_music'))?.fileName, 'score2.pdf', 'sheet music replaced');
    assert.equal(
      (await db.select().from(songFiles).where(eq(songFiles.conversationId, conv.id))).length,
      2,
      'two rows: one audio + one sheet music',
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

test('song-files: multiple audio versions, default invariant, set/delete', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'SF_VER', email: 'v@x.com', name: 'V' });
    const band = await createBand(owner.id, 'Ver Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(band.id, 'driveVER', 'Song.mp3');

    const a = await addAudioVersion({
      conversationId: conv.id,
      data: Buffer.from('AAAA'),
      fileName: 'studio.mp3',
      mimeType: 'audio/mpeg',
      label: 'Studio',
    });
    const b = await addAudioVersion({
      conversationId: conv.id,
      data: Buffer.from('BBBBBB'),
      fileName: 'live.mp3',
      mimeType: 'audio/mpeg',
      label: 'Live',
    });
    assert.ok(a.isDefault, 'first added is default');
    assert.ok(!b.isDefault, 'second added is not default');

    // exactly one default; default first in the list
    let versions = await listAudioVersions(conv.id);
    assert.equal(versions.length, 2, 'two versions listed');
    assert.equal(versions.filter((v) => v.isDefault).length, 1, 'exactly one default');
    assert.equal(versions[0]!.id, a.id, 'default sorts first');

    // the default is what getSongFileMeta / streamSongFile('audio') resolve to
    assert.equal((await getSongFileMeta(conv.id, 'audio'))?.fileName, 'studio.mp3', 'default served');

    // a specific version streams its own bytes
    const bStream = await streamAudioVersion(conv.id, b.id);
    assert.ok(bStream && (await streamToBuffer(bStream.body)).equals(Buffer.from('BBBBBB')), 'version bytes served');
    assert.ok(await getAudioVersionMeta(conv.id, b.id), 'version meta resolves');
    assert.equal(await getAudioVersionMeta(conv.id, 'nope'), null, 'unknown version → null');

    // set default flips exactly one
    assert.ok(await setDefaultAudioVersion(conv.id, b.id), 'set default succeeds');
    versions = await listAudioVersions(conv.id);
    assert.equal(versions.find((v) => v.isDefault)?.id, b.id, 'b is now default');
    assert.equal(versions.filter((v) => v.isDefault).length, 1, 'still exactly one default');
    assert.equal(await setDefaultAudioVersion(conv.id, 'nope'), false, 'unknown version → false');

    // deleting the default promotes the newest remaining to default
    const del = await deleteAudioVersion(conv.id, b.id);
    assert.equal(del?.newDefaultId, a.id, 'deleting default promotes the remaining version');
    versions = await listAudioVersions(conv.id);
    assert.equal(versions.length, 1, 'one version left');
    assert.ok(versions[0]!.isDefault, 'remaining version is default');
    assert.equal(await deleteAudioVersion(conv.id, b.id), null, 'deleting a gone version → null');

    // deleting the last version leaves the song audio-less
    const delLast = await deleteAudioVersion(conv.id, a.id);
    assert.equal(delLast?.newDefaultId, null, 'no promotion when none remain');
    assert.equal((await listAudioVersions(conv.id)).length, 0, 'no versions left');
    assert.ok(!(await hasSongFile(conv.id, 'audio')), 'song has no audio');
  } finally {
    if (bandId) await deleteBand(bandId);
    await db.delete(users).where(eq(users.googleSub, 'SF_VER'));
  }
});
