/**
 * In-memory fixed-window rate limiter.
 *
 * The app runs as a single long-lived Node process on Railway (not
 * serverless), so a plain in-process Map survives across requests and is
 * enough to blunt brute-force / abuse on the unauthenticated auth routes
 * (register, forgot, reset). It is deliberately simple: no Redis, no
 * cross-instance coordination. If the app is ever scaled to multiple
 * instances, move this to a shared store.
 *
 * Node-only (uses a module-level Map + timers) — must not be imported by
 * the Edge `auth.config.ts` graph. Import only from `runtime = 'nodejs'`
 * route handlers.
 */

interface Window {
  count: number;
  resetAt: number; // epoch ms when the current window expires
}

const buckets = new Map<string, Window>();

// Bound memory: sweep expired entries at most once per SWEEP_MS, piggybacked
// on incoming calls (no background timer, so nothing keeps the event loop alive).
const SWEEP_MS = 5 * 60 * 1000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_MS) return;
  lastSweep = now;
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still permitted in the current window. */
  remaining: number;
  /** Seconds until the window resets (for a `Retry-After` header). */
  retryAfterSec: number;
}

/**
 * Record a hit against `key` and report whether it's within `limit`
 * requests per `windowMs`. The first request in a window starts the
 * clock; the window does NOT slide, so at most `limit` requests are
 * allowed per fixed `windowMs` interval.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  existing.count += 1;
  const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSec,
  };
}

/**
 * Best-effort client IP for rate-limit keying. Behind Railway's proxy the
 * real client is the first entry of `x-forwarded-for`; fall back to
 * `x-real-ip`, then a constant bucket (so a missing header degrades to a
 * shared limit rather than no limit).
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Reset all state. Test-only. */
export function __resetRateLimitStore(): void {
  buckets.clear();
  lastSweep = 0;
}
