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
  getNextEventForUser,
  listPastEventsForUser,
  removeEventMember,
  updateEvent,
} from '../../lib/db/events';

after(closeDb);

const inRange = (userId: string) =>
  listEventsForUserInRange(userId, '2026-07-01', '2026-07-31');

test('events: band-member + added-member visibility, range filter', async () => {
  const subs = ['E_OWNER', 'E_GUEST', 'E_STRANGER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'E_OWNER',
      email: 'eo@x.com',
      name: 'Owner',
    });
    const guest = await upsertUser({
      googleSub: 'E_GUEST',
      email: 'eg@x.com',
      name: 'Guest',
    });
    const stranger = await upsertUser({
      googleSub: 'E_STRANGER',
      email: 'es@x.com',
      name: 'Str',
    });

    const band = await createBand(owner.id, 'Event Band');
    bandId = band.id;

    const { id: eventId } = await createEvent({
      bandId: band.id,
      title: 'Gig',
      eventType: 'Show',
      date: '2026-07-15',
      endDate: null,
      time: '19:30',
      endTime: '21:30',
      location: 'The Club',
      details: null,
      notes: null,
      setlistId: null,
      venueId: null,
      createdBy: owner.id,
    });

    // Band member sees it; stranger and (not-yet-added) guest do not.
    assert.ok(
      (await inRange(owner.id)).some((e) => e.id === eventId),
      'owner sees event',
    );
    assert.ok(
      !(await inRange(stranger.id)).some((e) => e.id === eventId),
      'stranger blind',
    );
    assert.ok(
      !(await inRange(guest.id)).some((e) => e.id === eventId),
      'guest blind pre-add',
    );

    // getEventForUser mirrors that access.
    assert.ok(await getEventForUser(owner.id, eventId), 'owner can open');
    assert.equal(
      await getEventForUser(stranger.id, eventId),
      null,
      'stranger 404s',
    );
    assert.equal(
      await canAccessEvent(guest.id, eventId, band.id),
      false,
      'guest no access',
    );

    // Add the guest → now visible to them, still not the stranger.
    await addEventMember(eventId, guest.id);
    assert.ok(
      (await inRange(guest.id)).some((e) => e.id === eventId),
      'guest sees after add',
    );
    assert.ok(
      await getEventForUser(guest.id, eventId),
      'guest can open after add',
    );
    assert.equal(
      (await listEventMembers(eventId)).length,
      1,
      'one added member',
    );

    // Range filter excludes events outside the window.
    assert.ok(
      !(
        await listEventsForUserInRange(owner.id, '2026-08-01', '2026-08-31')
      ).some((e) => e.id === eventId),
      'event outside range hidden',
    );

    // Remove the guest → visibility revoked.
    await removeEventMember(eventId, guest.id);
    assert.ok(
      !(await inRange(guest.id)).some((e) => e.id === eventId),
      'guest blind after remove',
    );
  } finally {
    if (bandId) await db.delete(bands).where(eq(bands.id, bandId)); // cascades events + members
    await db.delete(events).where(eq(events.title, 'Gig'));
    await deleteUsersByGoogleSub(subs);
  }
});

/**
 * Multi-day events. The question every one of these asks is the same: does
 * the query look at the event's *last* day, or only the day it starts? Only
 * the first is right — a festival that opened on Friday is not a past event
 * on Saturday, and is not missing from Saturday's calendar.
 */
const MULTI_SUBS = ['E_MULTI'];

async function withMultiBand(
  fn: (userId: string, bandId: string) => Promise<void>,
) {
  let bandId: string | undefined;
  try {
    const user = await upsertUser({
      googleSub: 'E_MULTI',
      email: 'em@x.com',
      name: 'Multi',
    });
    const band = await createBand(user.id, 'Multi Band');
    bandId = band.id;
    await fn(user.id, band.id);
  } finally {
    if (bandId) {
      await db.delete(events).where(eq(events.bandId, bandId));
      await db.delete(bands).where(eq(bands.id, bandId));
    }
    await deleteUsersByGoogleSub(MULTI_SUBS);
  }
}

const makeEvent = (
  bandId: string,
  createdBy: string,
  date: string,
  endDate: string | null,
  title = 'Festival',
) =>
  createEvent({
    bandId,
    title,
    eventType: 'Show',
    date,
    endDate,
    time: null,
    endTime: null,
    location: null,
    details: null,
    notes: null,
    setlistId: null,
    venueId: null,
    createdBy,
  });

test('events: a same-day end date is stored as no end date', async () => {
  await withMultiBand(async (userId, bandId) => {
    const { id } = await makeEvent(bandId, userId, '2026-07-15', '2026-07-15');
    const [row] = await db
      .select({ endDate: events.endDate })
      .from(events)
      .where(eq(events.id, id));
    assert.equal(
      row!.endDate,
      null,
      'one spelling for "ends the day it starts", whatever the caller sent',
    );

    // A backwards range is nonsense; the column must not hold it either.
    const { id: backwards } = await makeEvent(
      bandId,
      userId,
      '2026-07-15',
      '2026-07-10',
    );
    const [back] = await db
      .select({ endDate: events.endDate })
      .from(events)
      .where(eq(events.id, backwards));
    assert.equal(back!.endDate, null);
  });
});

test('events: a range query finds an event by any day it covers', async () => {
  await withMultiBand(async (userId, bandId) => {
    // Starts in June, ends in August — it belongs to July even though
    // neither of its own dates falls in the month.
    const { id } = await makeEvent(bandId, userId, '2026-06-28', '2026-08-03');

    const july = await listEventsForUserInRange(
      userId,
      '2026-07-01',
      '2026-07-31',
    );
    assert.ok(
      july.some((e) => e.id === id),
      'a month the event only passes through still lists it',
    );

    // And the months at either end, which it does touch.
    for (const [from, to] of [
      ['2026-06-01', '2026-06-30'],
      ['2026-08-01', '2026-08-31'],
    ]) {
      const rows = await listEventsForUserInRange(userId, from!, to!);
      assert.ok(
        rows.some((e) => e.id === id),
        `${from} window`,
      );
    }

    // A window it misses entirely.
    const sept = await listEventsForUserInRange(
      userId,
      '2026-09-01',
      '2026-09-30',
    );
    assert.ok(!sept.some((e) => e.id === id), 'no overlap, not listed');
  });
});

test('events: an event is past only once its last day has gone', async () => {
  await withMultiBand(async (userId, bandId) => {
    const { id } = await makeEvent(bandId, userId, '2026-07-17', '2026-07-19');

    const midway = await listPastEventsForUser(userId, '2026-07-18');
    assert.ok(
      !midway.some((e) => e.id === id),
      'still running on the 18th, so not history',
    );

    const next = await getNextEventForUser(userId, '2026-07-18');
    assert.equal(
      next?.id,
      id,
      'and still ahead of you on the 18th, not behind',
    );

    // The 19th is the last day: over on the 20th, not before.
    assert.ok(
      !(await listPastEventsForUser(userId, '2026-07-19')).some(
        (e) => e.id === id,
      ),
      'the final day is not yet past',
    );
    assert.ok(
      (await listPastEventsForUser(userId, '2026-07-20')).some(
        (e) => e.id === id,
      ),
      'past the day after it ends',
    );
  });
});

test('events: a single-day event still turns over the next day', async () => {
  await withMultiBand(async (userId, bandId) => {
    const { id } = await makeEvent(bandId, userId, '2026-07-15', null, 'Gig');
    assert.ok(
      !(await listPastEventsForUser(userId, '2026-07-15')).some(
        (e) => e.id === id,
      ),
      'not past on the day itself',
    );
    assert.ok(
      (await listPastEventsForUser(userId, '2026-07-16')).some(
        (e) => e.id === id,
      ),
      'past the next day, exactly as before end dates existed',
    );
  });
});

test('events: editing can add and clear an end date', async () => {
  await withMultiBand(async (userId, bandId) => {
    const { id } = await makeEvent(bandId, userId, '2026-07-17', null);
    const base = {
      title: 'Festival',
      eventType: 'Show',
      time: null,
      endTime: null,
      location: null,
      details: null,
      notes: null,
      setlistId: null,
      venueId: null,
    };

    await updateEvent(id, {
      ...base,
      date: '2026-07-17',
      endDate: '2026-07-19',
    });
    let [row] = await db
      .select({ endDate: events.endDate })
      .from(events)
      .where(eq(events.id, id));
    assert.equal(row!.endDate, '2026-07-19', 'extended');

    await updateEvent(id, { ...base, date: '2026-07-17', endDate: null });
    [row] = await db
      .select({ endDate: events.endDate })
      .from(events)
      .where(eq(events.id, id));
    assert.equal(row!.endDate, null, 'back to a single day');
  });
});

test('events: queries carry the creator name that time off is labelled with', async () => {
  await withMultiBand(async (userId, bandId) => {
    const { id } = await makeEvent(
      bandId,
      userId,
      '2026-07-15',
      null,
      'Time off',
    );

    const [listed] = await listEventsForUserInRange(
      userId,
      '2026-07-01',
      '2026-07-31',
    );
    assert.equal(listed?.id, id);
    assert.equal(
      listed?.createdByName,
      'Multi',
      'the range query joins the creator, so the calendar can label it',
    );

    // And the single-event read the detail page uses.
    const detail = await getEventForUser(userId, id);
    assert.equal(detail?.createdByName, 'Multi');
  });
});
