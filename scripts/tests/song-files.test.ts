import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, songFiles, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { createBand } from '../../lib/db/bands';
import { findOrCreateConversation } from '../../lib/db/conversations';
import {
  deleteSongFile,
  getSongFileMeta,
  hasSongFile,
  putSongFile,
  readSongFileRange,
} from '../../lib/db/song-files';

after(closeDb);

test('song-files: bytea round-trip, range slices, upsert, cascade', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'SF_OWNER', email: 'o@x.com', name: 'O' });
    const band = await createBand(owner.id, 'SF Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(band.id, 'driveSF', 'Song.mp3');

    const data = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
    await putSongFile({
      conversationId: conv.id,
      kind: 'audio',
      data,
      fileName: 'Song.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'driveSF',
    });

    assert.ok(await hasSongFile(conv.id, 'audio'), 'hasSongFile true');
    const meta = await getSongFileMeta(conv.id, 'audio');
    assert.equal(meta?.sizeBytes, 1024, 'size 1024');
    assert.equal(meta?.mimeType, 'audio/mpeg', 'mime stored');

    const full = await readSongFileRange(conv.id, 'audio', 0, 1024);
    assert.ok(full && full.equals(data), 'full read round-trips');
    const slice = await readSongFileRange(conv.id, 'audio', 100, 50);
    assert.ok(slice && slice.equals(data.subarray(100, 150)), 'mid range slice matches');
    const tail = await readSongFileRange(conv.id, 'audio', 1000, 24);
    assert.ok(tail && tail.equals(data.subarray(1000, 1024)), 'tail slice matches');

    const data2 = Buffer.from('hello world', 'utf8');
    await putSongFile({
      conversationId: conv.id,
      kind: 'audio',
      data: data2,
      fileName: 'New.wav',
      mimeType: 'audio/wav',
    });
    const meta2 = await getSongFileMeta(conv.id, 'audio');
    assert.ok(
      meta2?.sizeBytes === data2.length && meta2?.fileName === 'New.wav',
      'upsert replaces the row',
    );
    assert.equal(
      (await db.select().from(songFiles).where(eq(songFiles.conversationId, conv.id))).length,
      1,
      'single row per (conversation, kind)',
    );

    await deleteSongFile(conv.id, 'audio');
    assert.ok(!(await hasSongFile(conv.id, 'audio')), 'deleted');

    // cascade: deleting the band removes the song file
    await putSongFile({
      conversationId: conv.id,
      kind: 'audio',
      data,
      fileName: 'Song.mp3',
      mimeType: 'audio/mpeg',
    });
    await db.delete(bands).where(eq(bands.id, band.id));
    bandId = undefined;
    assert.equal(
      (await db.select().from(songFiles).where(eq(songFiles.conversationId, conv.id))).length,
      0,
      'cascade delete on band removal',
    );
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId));
    await db.delete(users).where(eq(users.googleSub, 'SF_OWNER'));
  }
});
