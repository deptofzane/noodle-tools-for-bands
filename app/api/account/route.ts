import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import {
  confirmableEmails,
  deleteAccount,
  planAccountDeletion,
} from '@/lib/db/account-deletion';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET    /api/account  → what deleting this account would do (which bands go,
 *                        which are only left), for the confirmation screen.
 *
 * DELETE /api/account
 *   Body: { confirmEmail: string } → delete it.
 *
 * The typed address must match the login email or a linked provider's, which
 * is the deliberate-action check Google Play asks for. It's a confirmation,
 * not a credential — the session already proves who they are — so a mismatch
 * is a 400, and the attempt is rate limited so a stolen session can't grind
 * through guesses to trigger something destructive.
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await planAccountDeletion(user.id));
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const limit = rateLimit(`account-delete:${user.id}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many attempts. Try again later.' },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const typed =
    typeof body?.confirmEmail === 'string'
      ? body.confirmEmail.trim().toLowerCase()
      : '';
  if (!typed) {
    return NextResponse.json(
      { error: 'confirm_required', message: 'Type your email to confirm.' },
      { status: 400 },
    );
  }

  const allowed = await confirmableEmails(user.id);
  if (!allowed.includes(typed)) {
    return NextResponse.json(
      {
        error: 'confirm_mismatch',
        message: 'That doesn’t match the email on this account.',
      },
      { status: 400 },
    );
  }

  const plan = await deleteAccount(user.id);
  console.warn(
    `[account] deleted ${user.id}: ${plan.bandsDeleted.length} band(s) removed, ` +
      `${plan.bandsLeft.length} left, ${plan.personalNotesDeleted} note(s)`,
  );
  return NextResponse.json({ ok: true, ...plan });
}
