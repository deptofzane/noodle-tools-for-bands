import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { createBand, deleteBand } from '../../lib/db/bands';
import { findOrCreateConversation } from '../../lib/db/conversations';
import { addAudioVersion } from '../../lib/db/song-files';
import {
  createSetlist,
  getSetlist,
  getSetlistPracticeSongs,
  listBandSetlists,
  setSetlistSongs,
} from '../../lib/db/setlists';
import { closeObjectStore } from '../../lib/storage/s3';

after(() => {
  closeObjectStore();
  return closeDb();
});

const streamOf = (b: Buffer) => ({ body: Readable.from(b), sizeBytes: b.length });

test('setlists: a multi-version song appears once (its default)', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'SL_OWNER', email: 'slo@x.com', name: 'O' });
    const band = await createBand(owner.id, 'SL Band');
    bandId = band.id;

    const a = await findOrCreateConversation(band.id, 'driveSLA', 'Song A.mp3');
    const b = await findOrCreateConversation(band.id, 'driveSLB', 'Song B.mp3');

    // Song A has two audio versions; the first is the default.
    await addAudioVersion({
      conversationId: a.id,
      ...streamOf(Buffer.from('AAAA')),
      fileName: 'studio.mp4',
      mimeType: 'audio/mp4',
    });
    await addAudioVersion({
      conversationId: a.id,
      ...streamOf(Buffer.from('BBBB')),
      fileName: 'live.wav',
      mimeType: 'audio/wav',
    });
    // Song B has a single version.
    await addAudioVersion({
      conversationId: b.id,
      ...streamOf(Buffer.from('CCCC')),
      fileName: 'b.mp3',
      mimeType: 'audio/mpeg',
    });

    const setlist = await createSetlist({
      bandId: band.id,
      createdBy: owner.id,
      name: 'Set 1',
      conversationIds: [a.id, b.id],
    });

    // Detail view: two songs, not three (A must not duplicate per version).
    const detail = await getSetlist(setlist.id);
    assert.equal(detail?.songs.length, 2, 'each song once in getSetlist');
    assert.deepEqual(
      detail?.songs.map((s) => s.conversationId),
      [a.id, b.id],
      'order preserved',
    );

    // Band listing: same.
    const [listed] = await listBandSetlists(band.id);
    assert.equal(listed?.songs.length, 2, 'each song once in listBandSetlists');

    // Practice: two songs, and song A uses its DEFAULT version's mime, not
    // the arbitrary/last one.
    const practice = await getSetlistPracticeSongs(setlist.id);
    assert.equal(practice.length, 2, 'two practice songs');
    assert.equal(
      practice.find((p) => p.conversationId === a.id)?.mimeType,
      'audio/mp4',
      'practice uses the default version',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['SL_OWNER']);
  }
});

test('setlists: markers (set break / custom) coexist with songs', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'SL_MARK', email: 'slm@x.com', name: 'O' });
    const band = await createBand(owner.id, 'SLM Band');
    bandId = band.id;
    const song = await findOrCreateConversation(band.id, 'driveSLM', 'Song.mp3');
    await addAudioVersion({
      conversationId: song.id,
      ...streamOf(Buffer.from('AAAA')),
      fileName: 'a.mp3',
      mimeType: 'audio/mpeg',
    });

    const setlist = await createSetlist({
      bandId: band.id,
      createdBy: owner.id,
      name: 'Set',
      conversationIds: [song.id],
    });

    // A song, then two markers.
    await setSetlistSongs(setlist.id, [
      { conversationId: song.id, label: null },
      { conversationId: null, label: 'Set break' },
      { conversationId: null, label: 'Encore' },
    ]);

    const detail = await getSetlist(setlist.id);
    assert.deepEqual(
      detail?.songs.map((s) => s.name),
      ['Song.mp3', 'Set break', 'Encore'],
      'items in order, markers by label',
    );
    assert.equal(detail?.songs[0]?.conversationId, song.id, 'song keeps conversation');
    assert.equal(detail?.songs[1]?.conversationId, null, 'marker has no conversation');

    // Practice steps through every item; markers are non-playable steps.
    const practice = await getSetlistPracticeSongs(setlist.id);
    assert.equal(practice.length, 3, 'songs and markers are all steps');
    assert.equal(practice[0]?.conversationId, song.id, 'first step is the song');
    assert.equal(practice[1]?.conversationId, null, 'set break is not playable');
    assert.equal(practice[1]?.title, 'Set break', 'break carries its label');

    // Markers with the same label can repeat.
    await setSetlistSongs(setlist.id, [
      { conversationId: null, label: 'Break' },
      { conversationId: null, label: 'Break' },
    ]);
    assert.equal((await getSetlist(setlist.id))?.songs.length, 2, 'markers can repeat');

    // A duplicate song is rejected by the partial unique index.
    await assert.rejects(
      () =>
        setSetlistSongs(setlist.id, [
          { conversationId: song.id, label: null },
          { conversationId: song.id, label: null },
        ]),
      (err: unknown) => {
        const e = err as { code?: string; cause?: { code?: string } };
        return e?.code === '23505' || e?.cause?.code === '23505';
      },
      'a song appears at most once per setlist',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['SL_MARK']);
  }
});
