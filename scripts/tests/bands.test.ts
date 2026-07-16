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
  getMembership,
  listMembers,
  listMyBands,
  removeMember,
} from '../../lib/db/bands';

after(closeDb);

test('bands: creation, membership scoping, roles', async () => {
  const subs = ['T_OWNER', 'T_GUEST', 'T_STRANGER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'T_OWNER', email: 'o@x.com', name: 'Owner' });
    const guest = await upsertUser({ googleSub: 'T_GUEST', email: 'g@x.com', name: 'Guest' });
    const stranger = await upsertUser({ googleSub: 'T_STRANGER', email: 's@x.com', name: 'Str' });

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
    assert.equal((await listMembers(band.id)).length, 1, 'one member after remove');
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId));
    await deleteUsersByGoogleSub(subs);
  }
});
