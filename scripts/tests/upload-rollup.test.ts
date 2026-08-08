import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, isNull } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { notifications } from '../../lib/db/schema';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { notifyUploadBatch } from '../../lib/db/notifications';

after(closeDb);

const SUBS = ['UR_A', 'UR_B'];

/** The band's rollup rows, newest first. */
async function rollups(bandId: string) {
  return db
    .select({
      id: notifications.id,
      day: notifications.day,
      subjectLabel: notifications.subjectLabel,
      uploadCount: notifications.uploadCount,
      actorId: notifications.actorId,
      actorName: notifications.actorName,
      multiActor: notifications.multiActor,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.bandId, bandId),
        eq(notifications.kind, 'audio-added'),
        isNull(notifications.subjectId),
      ),
    );
}

const forDay = async (bandId: string, day: string) =>
  (await rollups(bandId)).find((r) => r.day === day);

test('upload rollup: one row per band per day, counting up', async () => {
  let bandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const band = await createBand(a.id, 'UR Band');
    bandId = band.id;

    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 3,
      day: '2026-08-04',
    });
    assert.equal(
      (await forDay(bandId, '2026-08-04'))?.subjectLabel,
      '3 uploads',
    );

    // A later batch the same day joins the same row.
    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 2,
      day: '2026-08-04',
    });
    assert.equal(
      (await forDay(bandId, '2026-08-04'))?.subjectLabel,
      '5 uploads',
    );
    assert.equal((await rollups(bandId)).length, 1, 'still one row');

    // The next day starts its own.
    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 1,
      day: '2026-08-05',
    });
    assert.equal((await rollups(bandId)).length, 2, 'one row per day');
    assert.equal(
      (await forDay(bandId, '2026-08-04'))?.subjectLabel,
      '5 uploads',
      'yesterday untouched',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('upload rollup: a lone upload is named, then the count takes over', async () => {
  let bandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const band = await createBand(a.id, 'UR Band');
    bandId = band.id;
    const day = '2026-08-04';

    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 1,
      day,
      name: 'Cascade.wav',
    });
    assert.equal(
      (await forDay(bandId, day))?.subjectLabel,
      'Cascade.wav',
      'a quiet day says which song',
    );

    // The count has to be recovered from that name — a named rollup is worth
    // one, so the second upload makes two, not one.
    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 1,
      day,
      name: 'Heaven.wav',
    });
    assert.equal((await forDay(bandId, day))?.subjectLabel, '2 uploads');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('upload rollup: a song named like a count is not read as one', async () => {
  let bandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const band = await createBand(a.id, 'UR Band');
    bandId = band.id;
    const day = '2026-08-04';

    // A file called "5" must count as one upload, not five.
    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 1,
      day,
      name: '5',
    });
    assert.equal((await forDay(bandId, day))?.subjectLabel, '5');
    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 1,
      day,
      name: 'x',
    });
    assert.equal(
      (await forDay(bandId, day))?.subjectLabel,
      '2 uploads',
      'not "6 uploads"',
    );
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('upload rollup: a second uploader makes the day nameless, for good', async () => {
  let bandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const b = await upsertUser({
      googleSub: 'UR_B',
      email: 'urb@x.com',
      name: 'Bo',
    });
    const band = await createBand(a.id, 'UR Band');
    bandId = band.id;
    await addMember(band.id, b.id, 'member');
    const day = '2026-08-04';

    await notifyUploadBatch({ bandId, actorId: a.id, added: 3, day });
    let row = await forDay(bandId, day);
    assert.equal(row?.multiActor, false, 'one uploader, still attributed');
    assert.equal(row?.actorName, 'Ann');

    // The same person again doesn't make it shared.
    await notifyUploadBatch({ bandId, actorId: a.id, added: 1, day });
    assert.equal((await forDay(bandId, day))?.multiActor, false);

    // A different person does.
    await notifyUploadBatch({ bandId, actorId: b.id, added: 2, day });
    row = await forDay(bandId, day);
    assert.equal(row?.multiActor, true, 'two uploaders, nobody named');
    assert.equal(row?.subjectLabel, '6 uploads');

    // And it stays that way when the first person adds more.
    await notifyUploadBatch({ bandId, actorId: a.id, added: 1, day });
    row = await forDay(bandId, day);
    assert.equal(row?.multiActor, true, 'sticky — no reclaiming the credit');
    assert.equal(row?.subjectLabel, '7 uploads');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('upload rollup: simultaneous uploads all land on one row', async () => {
  let bandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const b = await upsertUser({
      googleSub: 'UR_B',
      email: 'urb@x.com',
      name: 'Bo',
    });
    const band = await createBand(a.id, 'UR Band');
    bandId = band.id;
    await addMember(band.id, b.id, 'member');
    const day = '2026-08-04';

    // A rehearsal: both members' files arrive at once, none of them waiting
    // for the last to be counted. Read-then-write lost these — either two
    // callers read the same total and wrote the same one back, or both found
    // no row and created one each.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        notifyUploadBatch({
          bandId: bandId!,
          actorId: i % 2 === 0 ? a.id : b.id,
          added: 1,
          day,
          name: `take-${i}.wav`,
        }),
      ),
    );

    const rows = await rollups(bandId);
    assert.equal(rows.length, 1, 'one row for the day, however they raced');
    assert.equal(rows[0]?.uploadCount, 8, 'every upload counted');
    assert.equal(rows[0]?.subjectLabel, '8 uploads');
    assert.equal(rows[0]?.multiActor, true, 'two uploaders, nobody named');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('upload rollup: adding nothing is a no-op', async () => {
  let bandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const band = await createBand(a.id, 'UR Band');
    bandId = band.id;

    await notifyUploadBatch({
      bandId,
      actorId: a.id,
      added: 0,
      day: '2026-08-04',
    });
    assert.equal((await rollups(bandId)).length, 0, 'no row for zero uploads');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('upload rollup: each band keeps its own day', async () => {
  let bandId: string | undefined;
  let otherBandId: string | undefined;
  try {
    const a = await upsertUser({
      googleSub: 'UR_A',
      email: 'ura@x.com',
      name: 'Ann',
    });
    const band = await createBand(a.id, 'UR Band');
    const other = await createBand(a.id, 'UR Other Band');
    bandId = band.id;
    otherBandId = other.id;
    const day = '2026-08-04';

    await notifyUploadBatch({ bandId, actorId: a.id, added: 3, day });
    await notifyUploadBatch({
      bandId: otherBandId,
      actorId: a.id,
      added: 1,
      day,
    });

    assert.equal((await forDay(bandId, day))?.subjectLabel, '3 uploads');
    assert.equal((await forDay(otherBandId, day))?.subjectLabel, '1 upload');
  } finally {
    if (bandId) await deleteBand(bandId);
    if (otherBandId) await deleteBand(otherBandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});
