import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePitch,
  PITCH_MAX,
  PITCH_MIN,
  stepPitch,
} from '../../lib/pitch-shift';

test('pitch: an arrow moves one half-step', () => {
  assert.equal(stepPitch(0, 1), 1);
  assert.equal(stepPitch(0, -1), -1);
  assert.equal(stepPitch(-3, 1), -2);
});

test('pitch: an arrow stops at an octave either way', () => {
  assert.equal(stepPitch(PITCH_MAX, 1), PITCH_MAX);
  assert.equal(stepPitch(PITCH_MIN, -1), PITCH_MIN);
});

test('pitch: a typed value in range is taken as is, signed or not', () => {
  assert.equal(parsePitch('0'), 0);
  assert.equal(parsePitch('3'), 3);
  assert.equal(parsePitch('+3'), 3);
  assert.equal(parsePitch('-7'), -7);
});

test('pitch: out of range clamps to the bounds', () => {
  assert.equal(parsePitch('13'), PITCH_MAX);
  assert.equal(parsePitch('-40'), PITCH_MIN);
});

test('pitch: junk leaves the current setting alone', () => {
  assert.equal(parsePitch(''), null);
  assert.equal(parsePitch('up'), null);
  assert.equal(parsePitch('-'), null);
});

test('pitch: a decimal is taken as its whole part', () => {
  // Half-steps only: a quarter-tone isn't a key anyone plays in.
  assert.equal(parsePitch('2.6'), 2);
  assert.equal(parsePitch('-2.6'), -2);
});
