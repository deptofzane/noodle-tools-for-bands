import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isStale,
  type StaleRecord,
  type StaleSetlist,
} from '../../app/offline/staleness';

const AUDIO = (c: string, v: string) =>
  `/api/conversations/${c}/files/audio?version=${v}&name=Some%20Song.mp3`;
const SHEET = (c: string, v: string, at: string) =>
  `/api/conversations/${c}/files/sheet_music?version=${v}&v=${encodeURIComponent(at)}`;

const BOTH = { sheets: true, audio: true };
const T1 = '2026-08-01T10:00:00.000Z';
const T2 = '2026-08-06T10:00:00.000Z';

/** A setlist of one song with one sheet version and one default audio take. */
function setlist(
  over: Partial<StaleSetlist['songs'][number]> = {},
): StaleSetlist {
  return {
    songs: [
      {
        conversationId: 'c1',
        audioVersionId: 'a1',
        sheetVersions: [{ id: 's1', updatedAt: T1 }],
        ...over,
      },
    ],
  };
}

/** A record of that same setlist, downloaded whole. */
function record(over: Partial<StaleRecord> = {}): StaleRecord {
  return {
    choices: BOTH,
    urls: [SHEET('c1', 's1', T1), AUDIO('c1', 'a1')],
    ...over,
  };
}

test('staleness: an untouched setlist is not stale', () => {
  assert.equal(isStale(record(), setlist()), false);
});

test('staleness: a new default audio version is stale', () => {
  assert.equal(isStale(record(), setlist({ audioVersionId: 'a2' })), true);
});

test('staleness: new sheet music is stale', () => {
  const withExtraSheet = setlist({
    sheetVersions: [
      { id: 's1', updatedAt: T1 },
      { id: 's2', updatedAt: T2 },
    ],
  });
  assert.equal(isStale(record(), withExtraSheet), true);
});

test('staleness: replacing a sheet version in place is stale', () => {
  // Same version id, new bytes — which is why updatedAt is part of the key.
  const replaced = setlist({ sheetVersions: [{ id: 's1', updatedAt: T2 }] });
  assert.equal(isStale(record(), replaced), true);
});

test('staleness: reordering songs is stale', () => {
  const two: StaleSetlist = {
    songs: [
      { conversationId: 'c1', audioVersionId: 'a1', sheetVersions: [] },
      { conversationId: 'c2', audioVersionId: 'a2', sheetVersions: [] },
    ],
  };
  const downloadedInOrder = {
    choices: BOTH,
    urls: [AUDIO('c1', 'a1'), AUDIO('c2', 'a2')],
  };
  assert.equal(isStale(downloadedInOrder, two), false);

  const swapped: StaleSetlist = { songs: [two.songs[1]!, two.songs[0]!] };
  assert.equal(
    isStale(downloadedInOrder, swapped),
    true,
    'same files, different running order',
  );
});

test('staleness: adding or removing a song is stale', () => {
  const added: StaleSetlist = {
    songs: [
      ...setlist().songs,
      { conversationId: 'c2', audioVersionId: 'a2', sheetVersions: [] },
    ],
  };
  assert.equal(isStale(record(), added), true);
  assert.equal(isStale(record(), { songs: [] }), true);
});

test('staleness: a rename is not stale', () => {
  // The song's display name rides in the URL's `?name=`; the comparison reads
  // version ids instead, so renaming changes nothing worth re-downloading.
  const renamed = {
    choices: BOTH,
    urls: [
      SHEET('c1', 's1', T1),
      `/api/conversations/c1/files/audio?version=a1&name=A%20Completely%20New%20Name.mp3`,
    ],
  };
  assert.equal(isStale(renamed, setlist()), false);
});

test('staleness: only what was downloaded counts', () => {
  const sheetsOnly: StaleRecord = {
    choices: { sheets: true, audio: false },
    urls: [SHEET('c1', 's1', T1)],
  };
  // A new audio take doesn't concern someone who saved sheets alone.
  assert.equal(isStale(sheetsOnly, setlist({ audioVersionId: 'a2' })), false);
  // …but new sheet music does.
  assert.equal(
    isStale(
      sheetsOnly,
      setlist({ sheetVersions: [{ id: 's9', updatedAt: T2 }] }),
    ),
    true,
  );

  const audioOnly: StaleRecord = {
    choices: { sheets: false, audio: true },
    urls: [AUDIO('c1', 'a1')],
  };
  assert.equal(
    isStale(
      audioOnly,
      setlist({ sheetVersions: [{ id: 's9', updatedAt: T2 }] }),
    ),
    false,
    'sheet changes do not concern an audio-only download',
  );
  assert.equal(isStale(audioOnly, setlist({ audioVersionId: 'a2' })), true);
});

test('staleness: markers are ignored', () => {
  const withBreak: StaleSetlist = {
    songs: [
      { conversationId: null, audioVersionId: null, sheetVersions: [] },
      ...setlist().songs,
    ],
  };
  assert.equal(isStale(record(), withBreak), false);
});

test('staleness: a record predating url tracking never flags', () => {
  // Unknowable rather than unchanged. Nagging would be a guess, and so would
  // reassuring — this stays quiet and self-corrects on the next download.
  const ancient: StaleRecord = { choices: BOTH };
  assert.equal(isStale(ancient, setlist({ audioVersionId: 'a2' })), false);
});
