import { NextResponse } from 'next/server';
import { createCredentialUser, EmailTakenError } from '@/lib/db/users';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * POST /api/auth/register  { email, password, name? }
 *   → create an email/password account. The client then signs in with the
 *     Credentials provider. Rejects an email already in use (including a
 *     Google account) with 409.
 */
export const runtime = 'nodejs';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  const limit = rateLimit(`register:${clientIp(req)}`, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed)
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!EMAIL_RE.test(email))
    return NextResponse.json(
      { error: 'bad_email', message: 'Enter a valid email address.' },
      { status: 400 },
    );
  if (password.length < 8)
    return NextResponse.json(
      { error: 'weak_password', message: 'Password must be at least 8 characters.' },
      { status: 400 },
    );

  try {
    await createCredentialUser({ email, password, name: name || null });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailTakenError)
      return NextResponse.json(
        {
          error: 'email_taken',
          message: 'That email is already registered — try signing in.',
        },
        { status: 409 },
      );
    console.error('[register] failed', err);
    return NextResponse.json(
      { error: 'server_error', message: 'Could not create the account.' },
      { status: 500 },
    );
  }
}
