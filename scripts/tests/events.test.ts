import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { bands, events, users } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { createBand } from '../../lib/db/bands';
import {
  addEventMember,
  canAccessEvent,
  createEvent,
  getEventForUser,
  listEventsForUserInRange,
  listEventMembers,
  removeEventMember,
} from '../../lib/db/events';

after(closeDb);

const inRange = (userId: string) =>
  listEventsForUserInRange(userId, '2026-07-01', '2026-07-31');

test('events: band-member + added-member visibility, range filter', async () => {
  const subs = ['E_OWNER', 'E_GUEST', 'E_STRANGER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'E_OWNER', email: 'eo@x.com', name: 'Owner' });
    const guest = await upsertUser({ googleSub: 'E_GUEST', email: 'eg@x.com', name: 'Guest' });
    const stranger = await upsertUser({ googleSub: 'E_STRANGER', email: 'es@x.com', name: 'Str' });

    const band = await createBand(owner.id, 'Event Band');
    bandId = band.id;

    const { id: eventId } = await createEvent({
      bandId: band.id,
      title: 'Gig',
      date: '2026-07-15',
      time: '19:30',
      location: 'The Club',
      details: null,
      setlistId: null,
      createdBy: owner.id,
    });

    // Band member sees it; stranger and (not-yet-added) guest do not.
    assert.ok((await inRange(owner.id)).some((e) => e.id === eventId), 'owner sees event');
    assert.ok(!(await inRange(stranger.id)).some((e) => e.id === eventId), 'stranger blind');
    assert.ok(!(await inRange(guest.id)).some((e) => e.id === eventId), 'guest blind pre-add');

    // getEventForUser mirrors that access.
    assert.ok(await getEventForUser(owner.id, eventId), 'owner can open');
    assert.equal(await getEventForUser(stranger.id, eventId), null, 'stranger 404s');
    assert.equal(await canAccessEvent(guest.id, eventId, band.id), false, 'guest no access');

    // Add the guest → now visible to them, still not the stranger.
    await addEventMember(eventId, guest.id);
    assert.ok((await inRange(guest.id)).some((e) => e.id === eventId), 'guest sees after add');
    assert.ok(await getEventForUser(guest.id, eventId), 'guest can open after add');
    assert.equal((await listEventMembers(eventId)).length, 1, 'one added member');

    // Range filter excludes events outside the window.
    assert.ok(
      !(await listEventsForUserInRange(owner.id, '2026-08-01', '2026-08-31')).some(
        (e) => e.id === eventId,
      ),
      'event outside range hidden',
    );

    // Remove the guest → visibility revoked.
    await removeEventMember(eventId, guest.id);
    assert.ok(!(await inRange(guest.id)).some((e) => e.id === eventId), 'guest blind after remove');
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId)); // cascades events + members
    await db.delete(events).where(eq(events.title, 'Gig'));
    await deleteUsersByGoogleSub(subs);
  }
});
