import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from './index';
import { passwordResetTokens } from './schema';

/**
 * Password-reset tokens. The raw token is returned once (for the email link);
 * only its SHA-256 hash is stored. Tokens are single-use and short-lived.
 */
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Mint a reset token for a user; returns the raw token to put in the link. */
export async function createResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return raw;
}

/**
 * Validate + consume a reset token. Atomically marks it used only if it's
 * unused and unexpired, so it can't be replayed. Returns the userId or null.
 */
export async function consumeResetToken(raw: string): Promise<string | null> {
  const [row] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(raw)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: passwordResetTokens.userId });
  return row?.userId ?? null;
}

/** Invalidate any outstanding reset tokens for a user (after a reset). */
export async function deleteUserResetTokens(userId: string): Promise<void> {
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));
}
