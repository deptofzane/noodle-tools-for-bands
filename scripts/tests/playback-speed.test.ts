import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpeedPercent,
  ratePercent,
  SPEED_MAX,
  SPEED_MIN,
} from '../../lib/playback-speed';

test('speed: a rate shows as a whole percentage', () => {
  assert.equal(ratePercent(1), 100);
  assert.equal(ratePercent(0.25), 25);
  assert.equal(ratePercent(2), 200);
  // Floating point from repeated steps shouldn't leak into the field.
  assert.equal(ratePercent(0.7000000000000001), 70);
});

test('speed: a value in range becomes that rate', () => {
  assert.equal(parseSpeedPercent('100'), 1);
  assert.equal(parseSpeedPercent('150'), 1.5);
  assert.equal(parseSpeedPercent('25'), 0.25);
  assert.equal(parseSpeedPercent('200'), 2);
});

test('speed: out of range clamps to the bounds', () => {
  assert.equal(parseSpeedPercent('1'), SPEED_MIN / 100);
  assert.equal(parseSpeedPercent('0'), SPEED_MIN / 100);
  assert.equal(parseSpeedPercent('-50'), SPEED_MIN / 100);
  assert.equal(parseSpeedPercent('999'), SPEED_MAX / 100);
});

test('speed: junk leaves the current setting alone', () => {
  // null is "don't change it" — resetting to 100 would throw away a speed
  // someone had deliberately set.
  assert.equal(parseSpeedPercent(''), null);
  assert.equal(parseSpeedPercent('   '), null);
  assert.equal(parseSpeedPercent('fast'), null);
});

test('speed: a decimal is taken as its whole part', () => {
  assert.equal(parseSpeedPercent('87.6'), 0.87);
});
