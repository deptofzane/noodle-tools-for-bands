import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { createResetToken } from '@/lib/db/reset-tokens';
import { sendPasswordResetEmail } from '@/lib/email';

/**
 * POST /api/auth/forgot  { email }
 *   → if a password account exists for that email, email a reset link.
 *     Always responds 200 (no account enumeration). Google-only accounts
 *     get nothing (they have no password to reset).
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';

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
