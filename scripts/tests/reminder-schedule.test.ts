import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMINDER_HOUR,
  dueReminders,
  reminderInstant,
  zonedHourToInstant,
} from '../../lib/reminder-schedule';

/*
 * No database and no `load-env`: the scheduling maths is pure, which is the
 * whole reason the vocabulary lives in `lib/reminder-prefs.ts` rather than
 * beside the queries. If this file ever needs a connection, something has
 * been imported that shouldn't be.
 */

/** The instant, read back as wall-clock time in that zone. */
const wallTime = (at: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);

/*
 * Absolute instants, so a broken offset can't pass by being consistently
 * broken — and the round trip beside each one, so a wrong expectation here
 * shows up as a failure rather than baking in a mistake.
 */
test('09:00 local resolves to the right instant, DST included', () => {
  const cases: [string, string, string][] = [
    // Denver: MST (-7) in winter, MDT (-6) in summer.
    ['2026-01-15', 'America/Denver', '2026-01-15T16:00:00.000Z'],
    ['2026-07-15', 'America/Denver', '2026-07-15T15:00:00.000Z'],
    // The two days the clocks actually move. 09:00 is after the change on
    // both, so spring-forward day is already MDT and fall-back day is MST.
    ['2026-03-08', 'America/Denver', '2026-03-08T15:00:00.000Z'],
    ['2026-11-01', 'America/Denver', '2026-11-01T16:00:00.000Z'],
    ['2026-01-15', 'Europe/London', '2026-01-15T09:00:00.000Z'],
    ['2026-07-15', 'Europe/London', '2026-07-15T08:00:00.000Z'],
    // Far enough east that 09:00 local is the previous day in UTC.
    ['2026-07-15', 'Pacific/Auckland', '2026-07-14T21:00:00.000Z'],
    ['2026-07-15', 'UTC', '2026-07-15T09:00:00.000Z'],
  ];

  for (const [ymd, tz, expected] of cases) {
    const at = zonedHourToInstant(ymd, REMINDER_HOUR, tz);
    assert.equal(at.toISOString(), expected, `${tz} ${ymd}`);
    assert.equal(wallTime(at, tz), `${ymd}, 09:00`, `${tz} ${ymd} round trip`);
  }
});

/*
 * The case naive arithmetic gets wrong: an event the week after the clocks
 * change. Subtracting 7×24h from the day-of instant would land at 08:00 local,
 * an hour early, because the offset is not the same at both ends.
 */
test('each offset is computed in its own local day, not by subtracting hours', () => {
  const event = {
    date: '2026-03-11', // MDT (-6)
    endDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    timezone: 'America/Denver',
  };

  const week = reminderInstant(event, 'event-week-before'); // 2026-03-04, MST
  const dayOf = reminderInstant(event, 'event-day-of');

  assert.equal(week.toISOString(), '2026-03-04T16:00:00.000Z');
  assert.equal(dayOf.toISOString(), '2026-03-11T15:00:00.000Z');
  // Both 09:00 where the band is, seven days apart — but 167 hours apart in
  // absolute terms, which is the whole point.
  assert.equal(wallTime(week, event.timezone), '2026-03-04, 09:00');
  assert.equal(wallTime(dayOf, event.timezone), '2026-03-11, 09:00');
  assert.equal(dayOf.getTime() - week.getTime(), 167 * 60 * 60 * 1000);
});

test('an offset is due once its moment has passed, and not before', () => {
  const event = {
    date: '2026-03-15',
    endDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    timezone: 'America/Denver',
  };
  // Week-before falls at 2026-03-08T15:00Z.
  assert.deepEqual(dueReminders(event, new Date('2026-03-08T14:59:00Z')), []);
  assert.deepEqual(dueReminders(event, new Date('2026-03-08T15:01:00Z')), [
    'event-week-before',
  ]);
  // A run that missed a day still sends — later is better than never.
  assert.deepEqual(dueReminders(event, new Date('2026-03-14T15:01:00Z')), [
    'event-week-before',
    'event-day-before',
  ]);
  assert.deepEqual(dueReminders(event, new Date('2026-03-15T15:01:00Z')), [
    'event-week-before',
    'event-day-before',
    'event-day-of',
  ]);
});

/*
 * Book something two days out and the week-before moment is already behind
 * you. Without the floor it would fire the instant the sweep next ran, which
 * reads as a bug rather than a reminder.
 */
test('a reminder never predates the event being created', () => {
  const event = {
    date: '2026-03-15',
    endDate: null,
    createdAt: new Date('2026-03-13T12:00:00Z'),
    timezone: 'America/Denver',
  };
  assert.deepEqual(dueReminders(event, new Date('2026-03-15T15:01:00Z')), [
    'event-day-before',
    'event-day-of',
  ]);
});

test('nothing fires once the event’s last local day is over', () => {
  const single = {
    date: '2026-03-15',
    endDate: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    timezone: 'America/Denver',
  };
  // Midnight ending the 15th in Denver is 2026-03-16T06:00Z.
  assert.notDeepEqual(
    dueReminders(single, new Date('2026-03-16T05:59:00Z')),
    [],
  );
  assert.deepEqual(dueReminders(single, new Date('2026-03-16T06:01:00Z')), []);

  // A run that covers the festival's middle days still reminds; one after its
  // final day does not.
  const festival = { ...single, endDate: '2026-03-18' };
  assert.notDeepEqual(
    dueReminders(festival, new Date('2026-03-17T12:00:00Z')),
    [],
  );
  assert.deepEqual(
    dueReminders(festival, new Date('2026-03-19T06:01:00Z')),
    [],
  );
});
