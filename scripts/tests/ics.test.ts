import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, type IcsEvent } from '../../lib/ics';

const baseEvent: IcsEvent = {
  id: 'abc-123',
  title: 'Gig',
  date: '2026-07-21',
  time: '19:00',
  endTime: null,
  location: null,
  description: null,
  url: null,
  updatedAt: new Date(Date.UTC(2026, 6, 20, 12, 30, 0)),
};

/** Split a rendered calendar into its CRLF-delimited lines. */
function lines(ics: string): string[] {
  return ics.split('\r\n');
}

test('ics: wrapper + required calendar properties', () => {
  const ics = buildCalendar({ name: 'Sidestage', events: [baseEvent] });
  const l = lines(ics);
  assert.equal(l[0], 'BEGIN:VCALENDAR');
  assert.ok(ics.includes('\r\nVERSION:2.0\r\n'), 'VERSION present');
  assert.ok(ics.includes('METHOD:PUBLISH'), 'publish method');
  assert.ok(ics.includes('X-WR-CALNAME:Sidestage'), 'calendar name');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'), 'ends with VCALENDAR + CRLF');
});

test('ics: timed event uses floating local time + default 2h end', () => {
  const ics = buildCalendar({ name: 'Sidestage', events: [baseEvent] });
  assert.ok(ics.includes('DTSTART:20260721T190000'), 'floating start, no Z');
  assert.ok(!ics.includes('DTSTART:20260721T190000Z'), 'no UTC marker on start');
  assert.ok(ics.includes('DTEND:20260721T210000'), 'start + 2h');
  assert.ok(ics.includes('UID:abc-123@sidestage.app'), 'stable UID');
  assert.ok(ics.includes('DTSTAMP:20260720T123000Z'), 'DTSTAMP in UTC');
});

test('ics: an explicit end time is used verbatim', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [{ ...baseEvent, endTime: '22:30' }],
  });
  assert.ok(ics.includes('DTSTART:20260721T190000'), 'start');
  assert.ok(ics.includes('DTEND:20260721T223000'), 'explicit end, not +2h');
});

test('ics: an end at/before the start rolls into the next day', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [{ ...baseEvent, time: '22:00', endTime: '01:00' }],
  });
  assert.ok(ics.includes('DTSTART:20260721T220000'), 'late start');
  assert.ok(ics.includes('DTEND:20260722T010000'), 'end next day');
});

test('ics: default duration is configurable', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [baseEvent],
    defaultDurationMinutes: 90,
  });
  assert.ok(ics.includes('DTEND:20260721T203000'), 'start + 90m');
});

test('ics: end crossing midnight rolls the date forward', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [{ ...baseEvent, time: '23:30' }],
  });
  assert.ok(ics.includes('DTSTART:20260721T233000'), 'late start');
  assert.ok(ics.includes('DTEND:20260722T013000'), 'end next day');
});

test('ics: all-day event (no time) uses VALUE=DATE with exclusive end', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [{ ...baseEvent, time: null }],
  });
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260721'), 'date-valued start');
  assert.ok(ics.includes('DTEND;VALUE=DATE:20260722'), 'exclusive next-day end');
  assert.ok(!ics.includes('T000000'), 'no midnight time component');
});

test('ics: TEXT values are escaped', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [
      {
        ...baseEvent,
        title: 'Rock, Paper; Scissors',
        description: 'Line 1\nLine 2 \\ done',
      },
    ],
  });
  assert.ok(ics.includes('SUMMARY:Rock\\, Paper\\; Scissors'), 'comma + semicolon');
  assert.ok(ics.includes('Line 1\\nLine 2 \\\\ done'), 'newline + backslash');
});

test('ics: long lines are folded to <=75 octets', () => {
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [{ ...baseEvent, title: 'A'.repeat(200) }],
  });
  const enc = new TextEncoder();
  for (const line of lines(ics)) {
    assert.ok(
      enc.encode(line).length <= 75,
      `line exceeds 75 octets: ${line.length}`,
    );
  }
  // A folded continuation line starts with a single space.
  assert.ok(/\r\n [A]/.test(ics), 'continuation line is space-prefixed');
});

test('ics: multi-byte characters are not split across a fold', () => {
  // 40 emoji (4 bytes each in UTF-8) forces folds; none may split a char.
  const ics = buildCalendar({
    name: 'Sidestage',
    events: [{ ...baseEvent, title: '🎸'.repeat(40) }],
  });
  // If a fold split a code point, the round-tripped title would corrupt.
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:' + '🎸'.repeat(40)), 'emoji intact');
});
