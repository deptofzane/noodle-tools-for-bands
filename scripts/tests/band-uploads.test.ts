import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { createBand, deleteBand } from '../../lib/db/bands';
import { findOrCreateConversation } from '../../lib/db/conversations';
import {
  addAudioVersion,
  addSheetVersion,
  listBandUploads,
} from '../../lib/db/song-files';
import { closeObjectStore } from '../../lib/storage/s3';

after(() => {
  closeObjectStore();
  return closeDb();
});

const SUBS = ['BU_OWNER'];
const streamOf = (b: Buffer) => ({
  body: Readable.from(b),
  sizeBytes: b.length,
});

/**
 * `listBandUploads` is what the Uploads history, the day page, and the daily
 * notification's play button all read. It answers "what audio arrived", which
 * is deliberately not the same question as "what songs exist" — the tests
 * below pin the three places those diverge.
 */
test('band uploads: every audio file, songs and versions alike', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'BU_OWNER',
      email: 'bu@x.com',
      name: 'Owner',
    });
    const band = await createBand(owner.id, 'BU Band');
    bandId = band.id;

    const one = await findOrCreateConversation(bandId, 'drive-1', 'Cascade');
    const two = await findOrCreateConversation(bandId, 'drive-2', 'Heaven');

    await addAudioVersion({
      conversationId: one.id,
      ...streamOf(Buffer.from('AAAA')),
      fileName: 'cascade-take-1.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'bu-a1',
    });
    // A second take of the *same* song is another upload, not another song.
    const take2 = await addAudioVersion({
      conversationId: one.id,
      ...streamOf(Buffer.from('BBBB')),
      fileName: 'cascade-take-2.wav',
      mimeType: 'audio/wav',
      label: 'Take 2',
      driveFileId: 'bu-a2',
    });
    await addAudioVersion({
      conversationId: two.id,
      ...streamOf(Buffer.from('CCCC')),
      fileName: 'heaven.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'bu-b1',
    });

    const uploads = await listBandUploads(bandId);
    assert.equal(uploads.length, 3, 'three files, not two songs');

    const t2 = uploads.find((u) => u.fileId === take2.id)!;
    assert.equal(t2.title, 'Cascade', 'the song names the row');
    assert.equal(t2.fileName, 'cascade-take-2.wav', 'the file is carried too');
    assert.equal(t2.label, 'Take 2');
    assert.equal(t2.conversationId, one.id);
    assert.equal(t2.isDefault, false, 'a later version is not the default');

    // Newest first: the list is bounded, so the recent end is the end that
    // has to fit in the first page.
    const times = uploads.map((u) => Date.parse(u.createdAt));
    assert.deepEqual(
      times,
      [...times].sort((a, b) => b - a),
      'descending',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('band uploads: pages cover the list once, newest first', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'BU_OWNER',
      email: 'bu@x.com',
      name: 'Owner',
    });
    const band = await createBand(owner.id, 'BU Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(bandId, 'drive-page', 'Paged');

    // Five takes in a row — a bulk import lands them close enough together
    // that `created_at` alone can tie, which is what the id tiebreak is for.
    for (let i = 0; i < 5; i++) {
      await addAudioVersion({
        conversationId: conv.id,
        ...streamOf(Buffer.from(`take-${i}`)),
        fileName: `take-${i}.mp3`,
        mimeType: 'audio/mpeg',
        driveFileId: `bu-page-${i}`,
      });
    }

    const all = await listBandUploads(bandId);
    assert.equal(all.length, 5, 'unpaged still returns everything');

    const first = await listBandUploads(bandId, { limit: 2, offset: 0 });
    const second = await listBandUploads(bandId, { limit: 2, offset: 2 });
    const third = await listBandUploads(bandId, { limit: 2, offset: 4 });
    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
    assert.equal(third.length, 1, 'the last page is short');

    const paged = [...first, ...second, ...third].map((u) => u.fileId);
    assert.deepEqual(
      paged,
      all.map((u) => u.fileId),
      'no row repeated or skipped across pages',
    );
    assert.equal(new Set(paged).size, 5, 'and every one distinct');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('band uploads: a time window returns only that window', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'BU_OWNER',
      email: 'bu@x.com',
      name: 'Owner',
    });
    const band = await createBand(owner.id, 'BU Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(
      bandId,
      'drive-win',
      'Windowed',
    );

    const before = new Date();
    await addAudioVersion({
      conversationId: conv.id,
      ...streamOf(Buffer.from('EEEE')),
      fileName: 'inside.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'bu-inside',
    });
    const after = new Date(Date.now() + 1000);

    // `from` is inclusive, `to` exclusive — the pair a local day turns into.
    assert.equal(
      (await listBandUploads(bandId, { from: before, to: after })).length,
      1,
      'inside the window',
    );
    assert.equal(
      (
        await listBandUploads(bandId, {
          from: after,
          to: new Date(Date.now() + 2000),
        })
      ).length,
      0,
      'a later window is empty',
    );
    assert.equal(
      (
        await listBandUploads(bandId, {
          from: new Date(before.getTime() - 2000),
          to: before,
        })
      ).length,
      0,
      'an earlier window is empty — `to` does not include its own instant',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('band uploads: a song with no audio never appears', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'BU_OWNER',
      email: 'bu@x.com',
      name: 'Owner',
    });
    const band = await createBand(owner.id, 'BU Band');
    bandId = band.id;

    // Created from just a name — a song, but never an upload.
    await findOrCreateConversation(bandId, 'drive-empty', 'Nothing Yet');
    assert.deepEqual(await listBandUploads(bandId), []);
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('band uploads: sheet music is not an upload', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'BU_OWNER',
      email: 'bu@x.com',
      name: 'Owner',
    });
    const band = await createBand(owner.id, 'BU Band');
    bandId = band.id;
    const conv = await findOrCreateConversation(bandId, 'drive-3', 'Chart');

    await addSheetVersion({
      conversationId: conv.id,
      ...streamOf(Buffer.from('%PDF-')),
      fileName: 'chart.pdf',
      mimeType: 'application/pdf',
      driveFileId: 'bu-sheet',
    });
    assert.deepEqual(
      await listBandUploads(bandId),
      [],
      'only kind=audio counts',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('band uploads: another band’s audio stays out', async () => {
  let bandId: string | undefined;
  let otherId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'BU_OWNER',
      email: 'bu@x.com',
      name: 'Owner',
    });
    const band = await createBand(owner.id, 'BU Band');
    const other = await createBand(owner.id, 'BU Other');
    bandId = band.id;
    otherId = other.id;

    const mine = await findOrCreateConversation(bandId, 'drive-mine', 'Mine');
    const theirs = await findOrCreateConversation(
      otherId,
      'drive-theirs',
      'Theirs',
    );
    for (const [conv, drive] of [
      [mine, 'bu-mine'],
      [theirs, 'bu-theirs'],
    ] as const) {
      await addAudioVersion({
        conversationId: conv.id,
        ...streamOf(Buffer.from('DDDD')),
        fileName: `${drive}.mp3`,
        mimeType: 'audio/mpeg',
        driveFileId: drive,
      });
    }

    const uploads = await listBandUploads(bandId);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0]!.title, 'Mine');
  } finally {
    if (bandId) await deleteBand(bandId);
    if (otherId) await deleteBand(otherId);
    await deleteUsersByGoogleSub(SUBS);
  }
});
