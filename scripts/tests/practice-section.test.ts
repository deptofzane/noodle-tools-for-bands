import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampStart,
  clampStop,
  formatSectionTime,
  MIN_SECTION,
  parseSectionTime,
  seekInSection,
} from '../../lib/practice-section';

test('section time: shown to the centisecond, always two decimals', () => {
  assert.equal(formatSectionTime(0, false), '0:00.00');
  assert.equal(formatSectionTime(30, false), '0:30.00');
  assert.equal(formatSectionTime(80.5, false), '1:20.50');
  // Past an hour without the hours form, minutes just keep counting.
  assert.equal(formatSectionTime(3723.25, false), '62:03.25');
  // Float noise doesn't leak into the digits.
  assert.equal(formatSectionTime(0.1 + 0.2, false), '0:00.30');
});

test('section time: hours form for long recordings', () => {
  assert.equal(formatSectionTime(0, true), '0:00:00.00');
  assert.equal(formatSectionTime(3723.25, true), '1:02:03.25');
});

test('section time: reads back what it shows', () => {
  for (const sec of [0, 30, 80.5, 3723.25]) {
    assert.equal(parseSectionTime(formatSectionTime(sec, false)), sec);
    assert.equal(parseSectionTime(formatSectionTime(sec, true)), sec);
  }
});

test('section time: typed forms', () => {
  assert.equal(parseSectionTime('1:20'), 80);
  assert.equal(parseSectionTime(' 1:20.5 '), 80.5);
  assert.equal(parseSectionTime('80.5'), 80.5);
  assert.equal(parseSectionTime('80.'), 80);
  assert.equal(parseSectionTime('.5'), 0.5);
  assert.equal(parseSectionTime('1:02:03.25'), 3723.25);
  // Finer than a centisecond rounds to one.
  assert.equal(parseSectionTime('1.234'), 1.23);
});

test('section time: junk and impossible times are refused', () => {
  for (const raw of ['', 'abc', '1:', ':30', '1:75', '1:60:00', '1:2:3:4', '-5', '1:-5']) {
    assert.equal(parseSectionTime(raw), null, raw);
  }
});

test('section: the start stays at least a second before the stop', () => {
  assert.equal(clampStart(30, 80), 30);
  assert.equal(clampStart(79.5, 80), 80 - MIN_SECTION);
  assert.equal(clampStart(120, 80), 80 - MIN_SECTION);
  assert.equal(clampStart(-3, 80), 0);
});

test('section: the stop stays at least a second after the start, within the song', () => {
  assert.equal(clampStop(80, 30, 200), 80);
  assert.equal(clampStop(30.5, 30, 200), 30 + MIN_SECTION);
  assert.equal(clampStop(10, 30, 200), 30 + MIN_SECTION);
  assert.equal(clampStop(250, 30, 200), 200);
});

test('section: seeks stay inside it, and past the stop means the start', () => {
  const s = { start: 30, stop: 80 };
  assert.equal(seekInSection(50, s), 50);
  assert.equal(seekInSection(30, s), 30);
  assert.equal(seekInSection(10, s), 30);
  // Clamping to the stop would end the section the instant it landed.
  assert.equal(seekInSection(80, s), 30);
  assert.equal(seekInSection(130, s), 30);
});
