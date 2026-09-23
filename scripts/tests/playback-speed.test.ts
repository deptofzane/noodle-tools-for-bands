import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpeedPercent,
  ratePercent,
  SPEED_MAX,
  SPEED_MIN,
  stepSpeed,
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

test('speed: an arrow moves a full 5%, without snapping', () => {
  assert.equal(stepSpeed(1, 1), 1.05);
  assert.equal(stepSpeed(1, -1), 0.95);
  assert.equal(stepSpeed(0.97, 1), 1.02);
  assert.equal(stepSpeed(0.97, -1), 0.92);
  // Float drift from earlier steps doesn't carry into the next one.
  assert.equal(stepSpeed(0.7000000000000001, 1), 0.75);
});

test('speed: an arrow stops at the bounds', () => {
  assert.equal(stepSpeed(SPEED_MAX / 100, 1), SPEED_MAX / 100);
  assert.equal(stepSpeed(SPEED_MIN / 100, -1), SPEED_MIN / 100);
  // Part of a step is still taken rather than refused.
  assert.equal(stepSpeed(1.97, 1), SPEED_MAX / 100);
  assert.equal(stepSpeed(0.27, -1), SPEED_MIN / 100);
});
