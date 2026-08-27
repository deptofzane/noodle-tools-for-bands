import '../load-env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { db } from '../../lib/db';
import { createBand, deleteBand } from '../../lib/db/bands';
import { createCredentialUser, getUserByEmail } from '../../lib/db/users';
import { findOrCreateConversation } from '../../lib/db/conversations';
import { conversations } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  addAudioVersion,
  addSheetVersion,
  bandStorageUsage,
  deleteBandFiles,
  listBandFiles,
  setSheetVersionPref,
  warningsForFiles,
} from '../../lib/db/song-files';

const EMAIL = 'files-test@noodle.test';

async function fixture() {
  const existing = await getUserByEmail(EMAIL);
  const user =
    existing ??
    (await createCredentialUser({
      email: EMAIL,
      password: 'files-test-password',
      name: 'Files Test',
    }));
  const band = await createBand(user.id, 'Files Test Band');
  return { user, band };
}

const bytes = (n: number) => Buffer.alloc(n, 1);

test('band storage: a band with no files reports zero, not null', async () => {
  const { band } = await fixture();
  try {
    // `sum()` returns null over an empty set — the caller must not see NaN.
    assert.deepEqual(await bandStorageUsage(band.id), { bytes: 0, files: 0 });
  } finally {
    await deleteBand(band.id);
  }
});

test('band storage: sums both kinds across songs', async () => {
  const { user, band } = await fixture();
  try {
    const a = await findOrCreateConversation(band.id, 'f-a', 'Song A');
    const b = await findOrCreateConversation(band.id, 'f-b', 'Song B');
    await addAudioVersion({
      conversationId: a.id,
      body: Readable.from(bytes(1000)),
      sizeBytes: 1000,
      fileName: 'a.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-a-1',
    });
    await addSheetVersion({
      conversationId: a.id,
      body: Readable.from(bytes(50)),
      sizeBytes: 50,
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      driveFileId: 'f-a-sheet',
    });
    await addAudioVersion({
      conversationId: b.id,
      body: Readable.from(bytes(300)),
      sizeBytes: 300,
      fileName: 'b.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-b-1',
    });

    assert.deepEqual(await bandStorageUsage(band.id), {
      bytes: 1350,
      files: 3,
    });
    void user;
  } finally {
    await deleteBand(band.id);
  }
});

test("band storage: one band's files never count toward another's", async () => {
  const { user } = await fixture();
  const mine = await createBand(user.id, 'Files Mine');
  const theirs = await createBand(user.id, 'Files Theirs');
  try {
    const c = await findOrCreateConversation(mine.id, 'f-iso', 'Isolated');
    await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(500)),
      sizeBytes: 500,
      fileName: 'iso.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-iso-1',
    });
    assert.equal((await bandStorageUsage(mine.id)).bytes, 500);
    assert.equal((await bandStorageUsage(theirs.id)).bytes, 0);
  } finally {
    await deleteBand(mine.id);
    await deleteBand(theirs.id);
  }
});

test('list files: both kinds, with sizes and the song name', async () => {
  const { band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'f-list', 'Listed Song');
    await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(64)),
      sizeBytes: 64,
      fileName: 'listed.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-list-1',
    });
    await addSheetVersion({
      conversationId: c.id,
      body: Readable.from(bytes(16)),
      sizeBytes: 16,
      fileName: 'listed.pdf',
      mimeType: 'application/pdf',
      driveFileId: 'f-list-sheet',
    });

    const files = await listBandFiles(band.id);
    assert.equal(files.length, 2);
    assert.deepEqual([...new Set(files.map((f) => f.kind))].sort(), [
      'audio',
      'sheet_music',
    ]);
    for (const f of files) {
      assert.equal(f.songName, 'Listed Song');
      assert.equal(f.songArchived, false);
      assert.ok(f.sizeBytes > 0, 'size should be populated');
      assert.ok(f.createdAt.endsWith('Z'), 'createdAt should be an ISO string');
    }
  } finally {
    await deleteBand(band.id);
  }
});

test('list files: reports the song’s archived state', async () => {
  const { band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'f-arch', 'Old Song');
    await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(32)),
      sizeBytes: 32,
      fileName: 'old.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-arch-1',
    });
    assert.equal((await listBandFiles(band.id))[0]?.songArchived, false);

    await db
      .update(conversations)
      .set({ archived: true })
      .where(eq(conversations.id, c.id));

    // The flag lives on the song, so it follows every file attached to it.
    assert.equal((await listBandFiles(band.id))[0]?.songArchived, true);
  } finally {
    await deleteBand(band.id);
  }
});

test('warnings: nothing remarkable produces no warnings', async () => {
  const { user, band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'w-none', 'Two Takes');
    const a = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(10)),
      sizeBytes: 10,
      fileName: 'take1.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'w-none-1',
    });
    await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(10)),
      sizeBytes: 10,
      fileName: 'take2.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'w-none-2',
    });
    // Two takes exist, so removing one leaves the song with audio.
    assert.deepEqual(await warningsForFiles([a.id], user.id), []);
  } finally {
    await deleteBand(band.id);
  }
});

test('warnings: flags the last audio version of a song', async () => {
  const { user, band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'w-last', 'Only Take');
    const only = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(10)),
      sizeBytes: 10,
      fileName: 'only.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'w-last-1',
    });
    const [w] = await warningsForFiles([only.id], user.id);
    assert.equal(w?.lastAudio, true);
    assert.equal(w?.chosenByOthers, 0);
  } finally {
    await deleteBand(band.id);
  }
});

test('warnings: selecting every take of a song warns on each', async () => {
  const { user, band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'w-both', 'Two Takes');
    const a = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(10)),
      sizeBytes: 10,
      fileName: 't1.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'w-both-1',
    });
    const b = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(10)),
      sizeBytes: 10,
      fileName: 't2.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'w-both-2',
    });
    // Judged on what the song is left with: taking both leaves it with none,
    // so both are flagged.
    const both = await warningsForFiles([a.id, b.id], user.id);
    assert.equal(both.length, 2);
    assert.ok(both.every((w) => w.lastAudio));

    // But taking only one leaves the other behind, so neither is remarkable.
    assert.deepEqual(await warningsForFiles([a.id], user.id), []);
  } finally {
    await deleteBand(band.id);
  }
});

test('warnings: flags a sheet another member reads, but not your own choice', async () => {
  const { user, band } = await fixture();
  const other =
    (await getUserByEmail('files-other@noodle.test')) ??
    (await createCredentialUser({
      email: 'files-other@noodle.test',
      password: 'files-other-password',
      name: 'Files Other',
    }));
  try {
    const c = await findOrCreateConversation(band.id, 'w-sheet', 'Charted');
    const sheet = await addSheetVersion({
      conversationId: c.id,
      body: Readable.from(bytes(10)),
      sizeBytes: 10,
      fileName: 'chart.pdf',
      mimeType: 'application/pdf',
      driveFileId: 'w-sheet-1',
    });

    // Your own choice is a consequence you can see, not a warning.
    await setSheetVersionPref(user.id, c.id, sheet.id);
    assert.deepEqual(await warningsForFiles([sheet.id], user.id), []);

    await setSheetVersionPref(other.id, c.id, sheet.id);
    const [w] = await warningsForFiles([sheet.id], user.id);
    assert.equal(w?.chosenByOthers, 1);
    assert.equal(w?.lastAudio, false);
  } finally {
    await deleteBand(band.id);
  }
});

test('warnings: ignores ids that are not files', async () => {
  const { user, band } = await fixture();
  try {
    assert.deepEqual(await warningsForFiles([], user.id), []);
    assert.deepEqual(await warningsForFiles(['not-a-uuid'], user.id), []);
    assert.deepEqual(
      await warningsForFiles(['00000000-0000-0000-0000-000000000000'], user.id),
      [],
    );
  } finally {
    await deleteBand(band.id);
  }
});

test('delete: removes both kinds and reports the bytes freed', async () => {
  const { band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'f-del', 'Deletable');
    const audio = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(700)),
      sizeBytes: 700,
      fileName: 'del.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-del-1',
    });
    const sheet = await addSheetVersion({
      conversationId: c.id,
      body: Readable.from(bytes(90)),
      sizeBytes: 90,
      fileName: 'del.pdf',
      mimeType: 'application/pdf',
      driveFileId: 'f-del-sheet',
    });

    const result = await deleteBandFiles(band.id, [audio.id, sheet.id]);
    assert.deepEqual(result.deleted.sort(), [audio.id, sheet.id].sort());
    assert.deepEqual(result.skipped, []);
    assert.equal(result.freedBytes, 790);
    assert.deepEqual(await bandStorageUsage(band.id), { bytes: 0, files: 0 });
  } finally {
    await deleteBand(band.id);
  }
});

test('delete: refuses a file belonging to another band', async () => {
  const { user } = await fixture();
  const mine = await createBand(user.id, 'Files Del Mine');
  const theirs = await createBand(user.id, 'Files Del Theirs');
  try {
    const c = await findOrCreateConversation(theirs.id, 'f-x', 'Theirs');
    const file = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(400)),
      sizeBytes: 400,
      fileName: 'x.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-x-1',
    });

    // The band scope is the security boundary: an owner of one band must not
    // be able to delete another band's files by passing their ids.
    const result = await deleteBandFiles(mine.id, [file.id]);
    assert.deepEqual(result, {
      deleted: [],
      skipped: [file.id],
      freedBytes: 0,
    });
    assert.equal((await bandStorageUsage(theirs.id)).bytes, 400);
  } finally {
    await deleteBand(mine.id);
    await deleteBand(theirs.id);
  }
});

test('delete: skips ids that are not files, deleting the rest', async () => {
  const { band } = await fixture();
  try {
    const c = await findOrCreateConversation(band.id, 'f-mix', 'Mixed');
    const file = await addAudioVersion({
      conversationId: c.id,
      body: Readable.from(bytes(120)),
      sizeBytes: 120,
      fileName: 'mix.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'f-mix-1',
    });

    const result = await deleteBandFiles(band.id, [
      file.id,
      c.id, // a real uuid, but a conversation
      'not-a-uuid',
    ]);
    assert.deepEqual(result.deleted, [file.id]);
    assert.deepEqual(result.skipped.sort(), [c.id, 'not-a-uuid'].sort());
    assert.equal(result.freedBytes, 120);
  } finally {
    await deleteBand(band.id);
  }
});
