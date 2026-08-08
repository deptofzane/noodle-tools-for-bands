import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutWeekBars, lastDayOf } from '../../app/calendar/eventBars';
import { eventLabel } from '../../app/calendar/eventLabel';
import { eventColorKey } from '../../app/calendar/eventColors';
import { eventDays, isMultiDay, parseEndDate } from '../../lib/event-dates';

/** Sun 12 – Sat 18 July 2026. */
const WEEK = [
  '2026-07-12',
  '2026-07-13',
  '2026-07-14',
  '2026-07-15',
  '2026-07-16',
  '2026-07-17',
  '2026-07-18',
];

const ev = (id: string, date: string, endDate: string | null = null) => ({
  id,
  date,
  endDate,
});

test('event bars: a single-day event is a one-column bar', () => {
  const { segments, laneCount } = layoutWeekBars(WEEK, [ev('a', '2026-07-14')]);
  assert.equal(laneCount, 1);
  assert.deepEqual(
    segments.map((s) => [
      s.startCol,
      s.endCol,
      s.continuesBefore,
      s.continuesAfter,
    ]),
    [[2, 2, false, false]],
  );
});

test('event bars: a multi-day event spans its columns', () => {
  const { segments } = layoutWeekBars(WEEK, [
    ev('a', '2026-07-14', '2026-07-16'),
  ]);
  assert.equal(segments[0]!.startCol, 2);
  assert.equal(segments[0]!.endCol, 4);
  assert.equal(segments[0]!.continuesBefore, false);
  assert.equal(segments[0]!.continuesAfter, false);
});

test('event bars: an event crossing a week edge is marked as continuing', () => {
  // Started the previous week and runs into the next: clipped at both ends,
  // and both ends know they are cut so the bar can be drawn flat there.
  const { segments } = layoutWeekBars(WEEK, [
    ev('a', '2026-07-09', '2026-07-22'),
  ]);
  const s = segments[0]!;
  assert.equal(s.startCol, 0);
  assert.equal(s.endCol, 6);
  assert.equal(s.continuesBefore, true);
  assert.equal(s.continuesAfter, true);
});

test('event bars: overlapping events get their own lanes', () => {
  const { segments, laneCount } = layoutWeekBars(WEEK, [
    ev('long', '2026-07-13', '2026-07-17'),
    ev('mid', '2026-07-14', '2026-07-15'),
    ev('one', '2026-07-15'),
  ]);
  assert.equal(laneCount, 3, 'all three overlap on the 15th');
  const lanes = Object.fromEntries(segments.map((s) => [s.event.id, s.lane]));
  assert.equal(lanes.long, 0, 'the longest takes the top lane');
  assert.equal(lanes.mid, 1);
  assert.equal(lanes.one, 2);
});

test('event bars: events that do not overlap share a lane', () => {
  // Monday–Tuesday then Thursday–Friday: one row is enough.
  const { segments, laneCount } = layoutWeekBars(WEEK, [
    ev('early', '2026-07-13', '2026-07-14'),
    ev('late', '2026-07-16', '2026-07-17'),
  ]);
  assert.equal(laneCount, 1);
  assert.deepEqual(
    segments.map((s) => s.lane),
    [0, 0],
  );
});

test('event bars: a week the event misses gets nothing', () => {
  const { segments, laneCount } = layoutWeekBars(WEEK, [
    ev('next-month', '2026-08-03', '2026-08-05'),
  ]);
  assert.deepEqual(segments, []);
  assert.equal(laneCount, 0);
});

test('event bars: bars are clipped to days the grid actually renders', () => {
  // A leading padding week: the month starts on Wednesday, so Sun–Tue are
  // null. An event running from the previous month starts at the first real
  // day, and still reports that it began earlier.
  const padded = [
    null,
    null,
    '2026-07-01',
    '2026-07-02',
    '2026-07-03',
    null,
    null,
  ];
  const { segments } = layoutWeekBars(padded, [
    ev('a', '2026-06-28', '2026-07-02'),
  ]);
  const s = segments[0]!;
  assert.equal(s.startCol, 2, 'starts at the first rendered day');
  assert.equal(s.endCol, 3);
  assert.equal(s.continuesBefore, true);
  assert.equal(s.continuesAfter, false);
});

test('event bars: layout is stable for the same input', () => {
  const events = [
    ev('b', '2026-07-14', '2026-07-15'),
    ev('a', '2026-07-14', '2026-07-15'),
  ];
  const first = layoutWeekBars(WEEK, events);
  const second = layoutWeekBars(WEEK, [...events].reverse());
  assert.deepEqual(
    first.segments.map((s) => [s.event.id, s.lane]),
    second.segments.map((s) => [s.event.id, s.lane]),
    'identical events lay out identically regardless of arrival order',
  );
});

test('event dates: lastDayOf ignores an end that is not after the start', () => {
  assert.equal(lastDayOf(ev('a', '2026-07-14')), '2026-07-14');
  assert.equal(lastDayOf(ev('a', '2026-07-14', '2026-07-14')), '2026-07-14');
  assert.equal(lastDayOf(ev('a', '2026-07-14', '2026-07-10')), '2026-07-14');
});

test('event dates: eventDays enumerates the span inclusively', () => {
  assert.deepEqual(eventDays('2026-07-14', null), ['2026-07-14']);
  assert.deepEqual(eventDays('2026-07-14', '2026-07-16'), [
    '2026-07-14',
    '2026-07-15',
    '2026-07-16',
  ]);
  // Across a month boundary, and across a DST change in most zones — these
  // are calendar days stepped in UTC, so neither can drop one.
  assert.deepEqual(eventDays('2026-10-31', '2026-11-02'), [
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
  ]);
  assert.equal(eventDays('2026-03-29', '2026-04-05').length, 8);
});

test('event dates: isMultiDay only counts a genuine span', () => {
  assert.equal(isMultiDay('2026-07-14', null), false);
  assert.equal(isMultiDay('2026-07-14', '2026-07-14'), false);
  assert.equal(isMultiDay('2026-07-14', '2026-07-15'), true);
});

test('event dates: parseEndDate normalizes and rejects', () => {
  assert.deepEqual(parseEndDate('2026-07-14', undefined), {
    ok: true,
    endDate: null,
  });
  assert.deepEqual(parseEndDate('2026-07-14', ''), { ok: true, endDate: null });
  // Same day is a single-day event, stored the one way single days are stored.
  assert.deepEqual(parseEndDate('2026-07-14', '2026-07-14'), {
    ok: true,
    endDate: null,
  });
  assert.deepEqual(parseEndDate('2026-07-14', '2026-07-16'), {
    ok: true,
    endDate: '2026-07-16',
  });
  // A backwards range is a typo worth surfacing, not something to silently
  // flatten into a one-day event.
  assert.equal(parseEndDate('2026-07-14', '2026-07-10').ok, false);
  assert.equal(parseEndDate('2026-07-14', 'nonsense').ok, false);
});

test('time off: the label is the creator, not the title', () => {
  const base = { title: 'Time off', createdByName: 'Steve' };
  assert.equal(
    eventLabel({ ...base, eventType: 'Time off' }),
    'Time off - Steve',
  );
  // Free text, so it has to match the way the colour key does.
  assert.equal(
    eventLabel({ ...base, eventType: 'time off' }),
    'Time off - Steve',
  );
  assert.equal(
    eventLabel({ ...base, eventType: '  Time Off  ' }),
    'Time off - Steve',
  );
});

test('time off: a creator with no name still reads as time off', () => {
  // Better than trailing a dash into nothing.
  assert.equal(
    eventLabel({
      title: 'Time off',
      eventType: 'Time off',
      createdByName: null,
    }),
    'Time off',
  );
  assert.equal(
    eventLabel({
      title: 'Time off',
      eventType: 'Time off',
      createdByName: '   ',
    }),
    'Time off',
  );
});

test('time off: every other event keeps its own title', () => {
  for (const type of [
    'Show',
    'Practice',
    'Writing session',
    'Studio',
    null,
    'Whatever',
  ]) {
    assert.equal(
      eventLabel({
        title: 'Summer Gig',
        eventType: type,
        createdByName: 'Steve',
      }),
      'Summer Gig',
      String(type),
    );
  }
});

test('time off: it gets its own colour, distinct from the rest', () => {
  assert.equal(eventColorKey('Time off'), 'time-off');
  assert.equal(eventColorKey('time off'), 'time-off');
  // And doesn't fall into the muted bucket that uncategorised events share.
  assert.notEqual(eventColorKey('Time off'), 'other');
  const keys = ['Show', 'Practice', 'Writing session', 'Studio'].map(
    eventColorKey,
  );
  assert.ok(!keys.includes('time-off'), 'no other preset borrows it');
});
