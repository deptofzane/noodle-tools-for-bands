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
 * `x-real-ip`. Returns null when no IP header is present.
 */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || null;
}

let warnedNoIp = false;

/**
 * Per-IP rate limit that FAILS OPEN when the client IP can't be determined.
 *
 * If the proxy header is ever missing, every caller would otherwise collapse
 * into one shared key and a single endpoint could be locked out app-wide.
 * Failing open avoids that; the per-account / per-email limits (keyed on
 * identity, not IP) remain the primary brute-force defense in that case.
 * The missing header is logged once so a misconfig is visible.
 */
export function rateLimitByIp(
  prefix: string,
  req: Request,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const ip = clientIp(req);
  if (!ip) {
    if (!warnedNoIp) {
      warnedNoIp = true;
      console.warn(
        '[rate-limit] no client IP header (x-forwarded-for / x-real-ip); per-IP limits are disabled for these requests',
      );
    }
    return { allowed: true, remaining: Infinity, retryAfterSec: 0 };
  }
  return rateLimit(`${prefix}:${ip}`, opts);
}

/** Reset all state. Test-only. */
export function __resetRateLimitStore(): void {
  buckets.clear();
  lastSweep = 0;
  warnedNoIp = false;
}
