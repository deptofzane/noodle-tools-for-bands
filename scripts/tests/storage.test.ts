import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND_STORAGE_LIMIT_BYTES, usageLevel } from '../../lib/storage';

// The thresholds decide whether an upload surface says anything at all, so
// they're worth pinning: a band just under 80% should see nothing.

const at = (fraction: number) =>
  usageLevel(BAND_STORAGE_LIMIT_BYTES * fraction);

test('the cap is 10 GB', () => {
  assert.equal(BAND_STORAGE_LIMIT_BYTES, 10 * 1024 ** 3);
});

test('quiet below 80%', () => {
  assert.equal(usageLevel(0), 'ok');
  assert.equal(at(0.5), 'ok');
  assert.equal(at(0.799), 'ok');
});

test('80% warns, 90% warns harder', () => {
  assert.equal(at(0.8), 'warn');
  assert.equal(at(0.899), 'warn');
  assert.equal(at(0.9), 'critical');
});

test('over the cap stays critical rather than wrapping', () => {
  assert.equal(at(1), 'critical');
  assert.equal(at(3), 'critical');
});
