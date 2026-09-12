import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { events } from '../../lib/db/schema';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import { createEvent } from '../../lib/db/events';
import { listNotifications } from '../../lib/db/notifications';
import { setReminderPref } from '../../lib/db/event-reminders';
import { createDueEventReminders } from '../../lib/db/event-reminder-sweep';

after(() => closeDb());

/**
 * The reminder sweep.
 *
 * It runs on a schedule, so the two properties that matter are that it sends
 * what's due and that running it again sends nothing — a missed run has to be
 * able to catch up without anyone's phone buzzing twice.
 */
const DENVER = 'America/Denver';
/** 09:01 in Denver on the day of a 2026-03-15 event. */
const DAY_OF = new Date('2026-03-15T15:01:00Z');

async function fixture(tag: string) {
  const owner = await upsertUser({
    googleSub: `SWP_A_${tag}`,
    email: `swpa-${tag}@x.com`,
    name: 'Owner',
  });
  const member = await upsertUser({
    googleSub: `SWP_B_${tag}`,
    email: `swpb-${tag}@x.com`,
    name: 'Member',
  });
  const band = await createBand(owner.id, `SWP Band ${tag}`, DENVER);
  await addMember(band.id, member.id, 'member');
  return { owner, member, bandId: band.id };
}

const cleanup = async (bandId: string, tag: string) => {
  await deleteBand(bandId);
  await deleteUsersByGoogleSub([`SWP_A_${tag}`, `SWP_B_${tag}`]);
};

/** An event on 2026-03-15, created long enough before to clear the floor. */
async function makeEvent(
  bandId: string,
  createdBy: string,
  title: string,
  eventType: string | null,
  createdAt = new Date('2026-01-01T00:00:00Z'),
) {
  const ev = await createEvent({
    bandId,
    title,
    eventType,
    date: '2026-03-15',
    endDate: null,
    time: '20:00',
    endTime: null,
    location: null,
    details: null,
    notes: null,
    setlistId: null,
    venueId: null,
    createdBy,
  });
  // `created_at` defaults to now(), and the floor rule compares against it.
  await db
    .update(events)
    .set({ createdAt })
    .where(eq(events.id, ev.id));
  return ev;
}

/** This user's reminder notifications, as `kind` strings. */
const reminders = async (userId: string) =>
  (await listNotifications(userId)).notifications
    .filter((n) => n.kind.startsWith('event-') && n.kind !== 'event-added')
    .map((n) => n.kind)
    .sort();

test('a show reminds everyone three times, and only once each', async () => {
  const tag = 'SHOW';
  const { owner, member, bandId } = await fixture(tag);
  try {
    await makeEvent(bandId, owner.id, 'SWP Gig', 'Show');

    const first = await createDueEventReminders(DAY_OF);
    assert.ok(first.created >= 6, 'two members × three offsets');

    const expected = [
      'event-day-before',
      'event-day-of',
      'event-week-before',
    ];
    // The creator included: they're on `actor_id` only because the column
    // demands one, and they need reminding about their own gig.
    assert.deepEqual(await reminders(owner.id), expected);
    assert.deepEqual(await reminders(member.id), expected);

    // Running again is the whole point of the unique index.
    const second = await createDueEventReminders(DAY_OF);
    assert.equal(second.created, 0, 'a second run sends nothing');
    assert.deepEqual(await reminders(owner.id), expected);
  } finally {
    await cleanup(bandId, tag);
  }
});

test('defaults hold: practice is day-of only, time off is silent', async () => {
  const tag = 'TYPES';
  const { owner, bandId } = await fixture(tag);
  try {
    await makeEvent(bandId, owner.id, 'SWP Practice', 'Practice');
    await createDueEventReminders(DAY_OF);
    assert.deepEqual(await reminders(owner.id), ['event-day-of']);

    await makeEvent(bandId, owner.id, 'Time off', 'Time off');
    await createDueEventReminders(DAY_OF);
    assert.deepEqual(
      await reminders(owner.id),
      ['event-day-of'],
      'time off added nothing',
    );
  } finally {
    await cleanup(bandId, tag);
  }
});

test('an explicit preference overrides the default', async () => {
  const tag = 'PREF';
  const { owner, bandId } = await fixture(tag);
  try {
    // Wants the week's warning for practices, and nothing on the day.
    await setReminderPref(owner.id, 'practice', 'event-week-before', true);
    await setReminderPref(owner.id, 'practice', 'event-day-of', false);

    await makeEvent(bandId, owner.id, 'SWP Practice', 'Practice');
    await createDueEventReminders(DAY_OF);
    assert.deepEqual(await reminders(owner.id), ['event-week-before']);
  } finally {
    await cleanup(bandId, tag);
  }
});

test('a reminder never fires for a moment before the event existed', async () => {
  const tag = 'FLOOR';
  const { owner, bandId } = await fixture(tag);
  try {
    // Booked two days out: the week-before moment is already behind us.
    await makeEvent(
      bandId,
      owner.id,
      'SWP Late Gig',
      'Show',
      new Date('2026-03-13T12:00:00Z'),
    );
    await createDueEventReminders(DAY_OF);
    assert.deepEqual(await reminders(owner.id), [
      'event-day-before',
      'event-day-of',
    ]);
  } finally {
    await cleanup(bandId, tag);
  }
});

test('nothing fires once the event is over', async () => {
  const tag = 'OVER';
  const { owner, bandId } = await fixture(tag);
  try {
    await makeEvent(bandId, owner.id, 'SWP Past Gig', 'Show');
    // Midnight ending the 15th in Denver is 2026-03-16T06:00Z.
    await createDueEventReminders(new Date('2026-03-16T06:01:00Z'));
    assert.deepEqual(await reminders(owner.id), []);
  } finally {
    await cleanup(bandId, tag);
  }
});
