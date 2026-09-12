import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import {
  BandAccessError,
  addMember,
  assertBandMember,
  createBand,
  getBandById,
  getMembership,
  isValidTimezone,
  listMembers,
  listMyBands,
  removeMember,
  setBandTimezone,
} from '../../lib/db/bands';

after(closeDb);

test('bands: creation, membership scoping, roles', async () => {
  const subs = ['T_OWNER', 'T_GUEST', 'T_STRANGER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'T_OWNER',
      email: 'o@x.com',
      name: 'Owner',
    });
    const guest = await upsertUser({
      googleSub: 'T_GUEST',
      email: 'g@x.com',
      name: 'Guest',
    });
    const stranger = await upsertUser({
      googleSub: 'T_STRANGER',
      email: 's@x.com',
      name: 'Str',
    });

    const band = await createBand(owner.id, 'Test Band');
    bandId = band.id;

    const ownerM = await getMembership(owner.id, band.id);
    assert.equal(ownerM?.role, 'owner', 'creator is owner');
    assert.ok(
      (await listMyBands(owner.id)).some((b) => b.id === band.id),
      'owner sees band',
    );
    assert.ok(
      !(await listMyBands(guest.id)).some((b) => b.id === band.id),
      'non-member does not see band',
    );

    await addMember(band.id, guest.id, 'member');
    const members = await listMembers(band.id);
    assert.equal(members.length, 2, 'two members after add');

    let blocked = false;
    try {
      await assertBandMember(stranger.id, band.id);
    } catch (e) {
      blocked = e instanceof BandAccessError;
    }
    assert.ok(blocked, 'assertBandMember blocks a stranger');

    await removeMember(band.id, guest.id);
    assert.equal(
      (await listMembers(band.id)).length,
      1,
      'one member after remove',
    );
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId));
    await deleteUsersByGoogleSub(subs);
  }
});

/*
 * The band's timezone decides when its event reminders fire. 'UTC' is only
 * the fallback for rows written before the column existed — a band created
 * through the app carries its creator's zone.
 */
test('bands: timezone defaults to UTC, is seeded on create, and can be set', async () => {
  const sub = 'TZ_OWNER';
  const owner = await upsertUser({
    googleSub: sub,
    email: 'tz-owner@x.com',
    name: 'Owner',
  });
  let plain = '';
  let seeded = '';
  try {
    plain = (await createBand(owner.id, 'TZ Plain')).id;
    assert.equal((await getBandById(plain))?.timezone, 'UTC');

    seeded = (await createBand(owner.id, 'TZ Seeded', 'America/Denver')).id;
    assert.equal((await getBandById(seeded))?.timezone, 'America/Denver');

    await setBandTimezone(plain, 'Europe/London');
    assert.equal((await getBandById(plain))?.timezone, 'Europe/London');
  } finally {
    for (const id of [plain, seeded])
      if (id) await db.delete(bands).where(eq(bands.id, id));
    await deleteUsersByGoogleSub([sub]);
  }
});

/*
 * An unknown zone can't be allowed to reach the column: nothing downstream
 * would throw, the reminders would just fire at the wrong hour for ever.
 */
test('bands: only zones this runtime knows are valid', () => {
  assert.equal(isValidTimezone('America/Denver'), true);
  assert.equal(isValidTimezone('UTC'), true);
  assert.equal(isValidTimezone('Europe/London'), true);
  assert.equal(isValidTimezone('Mars/Olympus_Mons'), false);
  assert.equal(isValidTimezone(''), false);
  assert.equal(isValidTimezone('America/Denver; drop table bands'), false);
});
