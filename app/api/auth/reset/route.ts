import { NextResponse } from 'next/server';
import { setUserPassword } from '@/lib/db/users';
import { consumeResetToken, deleteUserResetTokens } from '@/lib/db/reset-tokens';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/auth/reset  { token, password }
 *   → validate + consume the single-use token, set the new password, and
 *     invalidate any other outstanding tokens for the user.
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Tokens are 256-bit random (guessing is infeasible), but cap attempts
  // per IP anyway as defense-in-depth against scripted probing.
  const limit = rateLimit(`reset:${clientIp(req)}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed)
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (password.length < 8)
    return NextResponse.json(
      { error: 'weak_password', message: 'Password must be at least 8 characters.' },
      { status: 400 },
    );

  const userId = token ? await consumeResetToken(token) : null;
  if (!userId)
    return NextResponse.json(
      { error: 'invalid_token', message: 'This reset link is invalid or has expired.' },
      { status: 400 },
    );

  await setUserPassword(userId, password);
  await deleteUserResetTokens(userId);
  return NextResponse.json({ ok: true });
}
