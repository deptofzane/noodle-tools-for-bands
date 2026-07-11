import { NextResponse } from 'next/server';
import { setUserPassword } from '@/lib/db/users';
import { consumeResetToken, deleteUserResetTokens } from '@/lib/db/reset-tokens';

/**
 * POST /api/auth/reset  { token, password }
 *   → validate + consume the single-use token, set the new password, and
 *     invalidate any other outstanding tokens for the user.
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
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
