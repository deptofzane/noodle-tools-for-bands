import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { createResetToken } from '@/lib/db/reset-tokens';
import { sendPasswordResetEmail } from '@/lib/email';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/auth/forgot  { email }
 *   → if a password account exists for that email, email a reset link.
 *     Always responds 200 (no account enumeration). Google-only accounts
 *     get nothing (they have no password to reset).
 */
export const runtime = 'nodejs';

const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';

  // Two independent limits, both enumeration-safe (the 429 depends only on
  // request rate, never on whether the account exists): per-IP blunts a
  // scripted flood; per-email stops one address's inbox from being bombed.
  const perIp = rateLimit(`forgot:ip:${clientIp(req)}`, {
    limit: 5,
    windowMs: WINDOW_MS,
  });
  const perEmail = email
    ? rateLimit(`forgot:email:${email.toLowerCase()}`, {
        limit: 3,
        windowMs: WINDOW_MS,
      })
    : { allowed: true, retryAfterSec: 0 };
  if (!perIp.allowed || !perEmail.allowed) {
    const retryAfterSec = Math.max(perIp.retryAfterSec, perEmail.retryAfterSec);
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  if (email) {
    try {
      const user = await getUserByEmail(email);
      if (user?.passwordHash && user.email) {
        const token = await createResetToken(user.id);
        const base = process.env.AUTH_URL ?? new URL(req.url).origin;
        const resetUrl = `${base}/reset?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      }
    } catch (err) {
      // Don't leak failures to the caller (enumeration / info-leak).
      console.error('[forgot] failed', err);
    }
  }

  return NextResponse.json({ ok: true });
}
