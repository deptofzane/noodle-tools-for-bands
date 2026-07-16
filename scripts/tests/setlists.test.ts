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
