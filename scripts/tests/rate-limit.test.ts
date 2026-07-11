import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  __resetRateLimitStore,
  clientIp,
  rateLimit,
} from '../../lib/rate-limit';

test('rate-limit: allows up to the limit, then blocks', () => {
  __resetRateLimitStore();
  const opts = { limit: 3, windowMs: 60_000 };

  const r1 = rateLimit('k', opts);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  assert.equal(rateLimit('k', opts).remaining, 1);
  assert.equal(rateLimit('k', opts).remaining, 0);

  const blocked = rateLimit('k', opts);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec > 0, 'reports retry-after seconds');
});

test('rate-limit: keys are independent', () => {
  __resetRateLimitStore();
  const opts = { limit: 1, windowMs: 60_000 };
  assert.equal(rateLimit('a', opts).allowed, true);
  assert.equal(rateLimit('a', opts).allowed, false);
  // A different key has its own budget.
  assert.equal(rateLimit('b', opts).allowed, true);
});

test('rate-limit: window resets after it expires', async () => {
  __resetRateLimitStore();
  const opts = { limit: 1, windowMs: 30 };
  assert.equal(rateLimit('w', opts).allowed, true);
  assert.equal(rateLimit('w', opts).allowed, false);
  await sleep(45);
  assert.equal(rateLimit('w', opts).allowed, true, 'fresh window after expiry');
});

test('clientIp: prefers first x-forwarded-for, falls back', () => {
  const fwd = new Request('http://x', {
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
  });
  assert.equal(clientIp(fwd), '203.0.113.7');

  const real = new Request('http://x', { headers: { 'x-real-ip': '198.51.100.9' } });
  assert.equal(clientIp(real), '198.51.100.9');

  assert.equal(clientIp(new Request('http://x')), 'unknown');
});
