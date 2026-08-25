import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes } from '../../lib/format';

// Sizes sit next to a name in a tight row, so the shape matters as much as the
// number: never more than one decimal, always a space before the unit.

test('under a kilobyte stays in bytes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1), '1 B');
  assert.equal(formatBytes(1023), '1023 B');
});

test('it steps up a unit at a time', () => {
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024), '1.0 GB');
});

test('one decimal below ten, none above', () => {
  // 1.4 MB must not round to "1 MB" — that would read the same as 1.0 MB.
  assert.equal(formatBytes(1.4 * 1024 * 1024), '1.4 MB');
  assert.equal(formatBytes(9.9 * 1024 * 1024), '9.9 MB');
  assert.equal(formatBytes(34 * 1024 * 1024), '34 MB');
  assert.equal(formatBytes(512 * 1024), '512 KB');
});

test('realistic files from this app', () => {
  // The measured averages quoted in the working notes.
  assert.equal(formatBytes(34_000_000), '32 MB'); // a WAV
  assert.equal(formatBytes(4_200_000), '4.0 MB'); // an MP3
  assert.equal(formatBytes(48_000), '47 KB'); // a chart
});

test('nonsense is a dash, not "NaN B"', () => {
  assert.equal(formatBytes(Number.NaN), '—');
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), '—');
});

test('it never runs out of units', () => {
  assert.equal(formatBytes(5 * 1024 ** 4), '5.0 TB');
  // Past the table it stays in TB rather than printing "undefined".
  assert.match(formatBytes(9 * 1024 ** 5), /TB$/);
});
