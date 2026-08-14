import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { createBand, deleteBand } from '../../lib/db/bands';
import {
  deleteConversation,
  findOrCreateConversation,
} from '../../lib/db/conversations';
import { addAudioVersion, deleteAudioVersion } from '../../lib/db/song-files';
import {
  AlbumPinError,
  clearTrackPin,
  createAlbum,
  deleteAlbum,
  getAlbum,
  listAlbums,
  replaceAlbumTracks,
  resolveTrack,
  songsOnAnyAlbum,
} from '../../lib/db/albums';
import { closeObjectStore } from '../../lib/storage/s3';

after(() => {
  closeObjectStore();
  return closeDb();
});

const streamOf = (b: Buffer) => ({ body: Readable.from(b), sizeBytes: b.length });

const addAudio = (conversationId: string, fileName: string, label?: string) =>
  addAudioVersion({
    conversationId,
    ...streamOf(Buffer.from(fileName)),
    fileName,
    mimeType: 'audio/mpeg',
    label,
  });

// ── The resolution rules, driven directly ──────────────────────────────
// These are the whole feature, and they're pure, so they don't need a
// database to be pinned down.

const V = (id: string) => ({
  id,
  fileName: `${id}.mp3`,
  mimeType: 'audio/mpeg',
  songLength: 10,
});

test('albums: an unpinned track plays the song default', () => {
  const r = resolveTrack({
    audioVersionId: null,
    pinnedFileName: null,
    pinnedVersion: null,
    defaultVersion: V('def'),
  });
  assert.equal(r.state, 'default');
  assert.equal(r.audioVersionId, 'def');
});

test('albums: a live pin plays the pinned version, not the default', () => {
  const r = resolveTrack({
    audioVersionId: 'pin',
    pinnedFileName: 'pin.mp3',
    pinnedVersion: V('pin'),
    defaultVersion: V('def'),
  });
  assert.equal(r.state, 'pinned');
  assert.equal(r.audioVersionId, 'pin');
});

test('albums: a lost pin falls back to the default, flagged', () => {
  const r = resolveTrack({
    // The FK nulled the id; the snapshot is what says a pin was ever made.
    audioVersionId: null,
    pinnedFileName: 'gone.mp3',
    pinnedVersion: null,
    defaultVersion: V('def'),
  });
  assert.equal(r.state, 'lost');
  assert.equal(r.audioVersionId, 'def', 'still plays');
});

test('albums: a lost pin with no audio left is unplayable', () => {
  const r = resolveTrack({
    audioVersionId: null,
    pinnedFileName: 'gone.mp3',
    pinnedVersion: null,
    defaultVersion: null,
  });
  assert.equal(r.state, 'unplayable');
  assert.equal(r.audioVersionId, null);
});

test('albums: an unpinned track on a song with no audio is unplayable', () => {
  const r = resolveTrack({
    audioVersionId: null,
    pinnedFileName: null,
    pinnedVersion: null,
    defaultVersion: null,
  });
  assert.equal(r.state, 'unplayable');
});

// ── The same rules, end to end through Postgres ────────────────────────

test('albums: pinning, losing a version, and falling back', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_OWNER',
      email: 'albo@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Band');
    bandId = band.id;

    const song = await findOrCreateConversation(band.id, 'driveALB1', 'Song A');
    const first = await addAudio(song.id, 'studio.mp3');
    const alt = await addAudio(song.id, 'live.mp3', 'Live 2024');

    const albumId = await createAlbum(band.id, owner.id, 'Demos', [
      { conversationId: song.id, audioVersionId: alt.id },
    ]);

    // Pinned and present.
    let album = await getAlbum(albumId);
    assert.equal(album?.tracks.length, 1);
    assert.equal(album!.tracks[0]!.state, 'pinned');
    assert.equal(album!.tracks[0]!.audioVersionId, alt.id);
    assert.equal(album!.tracks[0]!.pinnedLabel, 'Live 2024');
    assert.equal(
      album!.tracks[0]!.audioStoredName,
      'live.mp3',
      'plays the pinned file, not the default',
    );

    // Delete the pinned version. The song keeps playing via its default.
    await deleteAudioVersion(song.id, alt.id);

    album = await getAlbum(albumId);
    const lost = album!.tracks[0]!;
    assert.equal(lost.state, 'lost');
    assert.equal(lost.audioVersionId, first.id, 'fell back to the default');
    assert.equal(lost.audioStoredName, 'studio.mp3');
    assert.equal(
      lost.pinnedFileName,
      'live.mp3',
      'the snapshot survives the delete, so the UI can name what was lost',
    );
    assert.equal(lost.pinnedLabel, 'Live 2024');

    // Resolving it: the track follows the default from now on, unflagged.
    await clearTrackPin(lost.id);
    album = await getAlbum(albumId);
    assert.equal(album!.tracks[0]!.state, 'default');
    assert.equal(album!.tracks[0]!.pinnedFileName, null);
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_OWNER']);
  }
});

test('albums: the last version going leaves the track unplayable', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_LAST',
      email: 'albl@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Last');
    bandId = band.id;

    const song = await findOrCreateConversation(band.id, 'driveALB2', 'Only');
    const only = await addAudio(song.id, 'only.mp3');
    const albumId = await createAlbum(band.id, owner.id, 'A', [
      { conversationId: song.id, audioVersionId: only.id },
    ]);

    await deleteAudioVersion(song.id, only.id);

    const album = await getAlbum(albumId);
    const t = album!.tracks[0]!;
    assert.equal(t.state, 'unplayable', 'nothing left to fall back to');
    assert.equal(t.audioVersionId, null);
    assert.equal(t.pinnedFileName, 'only.mp3', 'still says what it was');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_LAST']);
  }
});

test('albums: one song can sit on an album twice, pinned differently', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_DUP',
      email: 'albd@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Dup');
    bandId = band.id;

    const song = await findOrCreateConversation(band.id, 'driveALB3', 'Twice');
    const takeA = await addAudio(song.id, 'takeA.mp3', 'Take A');
    const takeB = await addAudio(song.id, 'takeB.mp3', 'Take B');

    const albumId = await createAlbum(band.id, owner.id, 'Both', [
      { conversationId: song.id, audioVersionId: takeA.id },
      { conversationId: song.id, audioVersionId: takeB.id },
    ]);

    const album = await getAlbum(albumId);
    assert.equal(album!.tracks.length, 2, 'no unique constraint got in the way');
    assert.deepEqual(
      album!.tracks.map((t) => t.audioStoredName),
      ['takeA.mp3', 'takeB.mp3'],
      'in position order, each on its own version',
    );
    assert.notEqual(
      album!.tracks[0]!.id,
      album!.tracks[1]!.id,
      'rows are distinct, so they can be edited independently',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_DUP']);
  }
});

test('albums: a pin from another song is refused', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_XPIN',
      email: 'albx@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Xpin');
    bandId = band.id;

    const a = await findOrCreateConversation(band.id, 'driveALB4a', 'A');
    const b = await findOrCreateConversation(band.id, 'driveALB4b', 'B');
    await addAudio(a.id, 'a.mp3');
    const bVersion = await addAudio(b.id, 'b.mp3');

    // The foreign key would happily accept this — it only checks the version
    // exists — so the guard has to be ours.
    await assert.rejects(
      () =>
        createAlbum(band.id, owner.id, 'Bad', [
          { conversationId: a.id, audioVersionId: bVersion.id },
        ]),
      (err: unknown) => err instanceof AlbumPinError,
      'pinning song A to song B’s audio must be refused',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_XPIN']);
  }
});

test('albums: deleting a song drops it from albums', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_DEL',
      email: 'albdel@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Del');
    bandId = band.id;

    const keep = await findOrCreateConversation(band.id, 'driveALB5a', 'Keep');
    const drop = await findOrCreateConversation(band.id, 'driveALB5b', 'Drop');
    await addAudio(keep.id, 'keep.mp3');
    await addAudio(drop.id, 'drop.mp3');

    const albumId = await createAlbum(band.id, owner.id, 'Two', [
      { conversationId: keep.id, audioVersionId: null },
      { conversationId: drop.id, audioVersionId: null },
    ]);

    await deleteConversation(drop.id);

    const album = await getAlbum(albumId);
    assert.equal(album!.tracks.length, 1, 'the deleted song cascaded away');
    assert.equal(album!.tracks[0]!.conversationId, keep.id);
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_DEL']);
  }
});

test('albums: replacing tracks rewrites order and re-takes the snapshot', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_EDIT',
      email: 'albe@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Edit');
    bandId = band.id;

    const a = await findOrCreateConversation(band.id, 'driveALB6a', 'A');
    const b = await findOrCreateConversation(band.id, 'driveALB6b', 'B');
    const aV = await addAudio(a.id, 'a.mp3');
    await addAudio(b.id, 'b.mp3');

    const albumId = await createAlbum(band.id, owner.id, 'Order', [
      { conversationId: a.id, audioVersionId: null },
      { conversationId: b.id, audioVersionId: null },
    ]);

    await replaceAlbumTracks(albumId, [
      { conversationId: b.id, audioVersionId: null },
      { conversationId: a.id, audioVersionId: aV.id },
    ]);

    const album = await getAlbum(albumId);
    assert.deepEqual(
      album!.tracks.map((t) => t.conversationId),
      [b.id, a.id],
      'positions come from the array order',
    );
    assert.deepEqual(album!.tracks.map((t) => t.position), [0, 1]);
    assert.equal(album!.tracks[1]!.state, 'pinned');
    assert.equal(album!.tracks[1]!.pinnedFileName, 'a.mp3');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_EDIT']);
  }
});

test('albums: Unassociated is what no album claims', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_UNF',
      email: 'albu@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Unf');
    bandId = band.id;

    const filed = await findOrCreateConversation(band.id, 'driveALB7a', 'Filed');
    const alsoFiled = await findOrCreateConversation(
      band.id,
      'driveALB7b',
      'Also',
    );
    const loose = await findOrCreateConversation(band.id, 'driveALB7c', 'Loose');

    // `alsoFiled` is on two albums — being filed twice still counts once.
    await createAlbum(band.id, owner.id, 'One', [
      { conversationId: filed.id, audioVersionId: null },
      { conversationId: alsoFiled.id, audioVersionId: null },
    ]);
    await createAlbum(band.id, owner.id, 'Two', [
      { conversationId: alsoFiled.id, audioVersionId: null },
    ]);

    const filedSet = await songsOnAnyAlbum(band.id, [
      filed.id,
      alsoFiled.id,
      loose.id,
    ]);
    assert.equal(filedSet.size, 2);
    assert.ok(filedSet.has(filed.id));
    assert.ok(filedSet.has(alsoFiled.id));
    assert.ok(!filedSet.has(loose.id), 'the loose song is Unassociated');

    assert.equal((await listAlbums(band.id)).length, 2);
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_UNF']);
  }
});

test('albums: deleting an album takes its tracks, not its songs', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'ALB_RM',
      email: 'albrm@x.com',
      name: 'O',
    });
    const band = await createBand(owner.id, 'ALB Rm');
    bandId = band.id;

    const song = await findOrCreateConversation(band.id, 'driveALB8', 'Song');
    await addAudio(song.id, 's.mp3');
    const albumId = await createAlbum(band.id, owner.id, 'Gone', [
      { conversationId: song.id, audioVersionId: null },
    ]);

    await deleteAlbum(albumId);

    assert.equal(await getAlbum(albumId), null);
    assert.equal(
      (await songsOnAnyAlbum(band.id, [song.id])).size,
      0,
      'the song is now Unassociated, but still exists',
    );
    const still = await findOrCreateConversation(band.id, 'driveALB8', 'Song');
    assert.equal(still.id, song.id, 'the song itself was untouched');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(['ALB_RM']);
  }
});
