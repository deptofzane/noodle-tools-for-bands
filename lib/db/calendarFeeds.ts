import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { calendarFeeds } from './schema';

/**
 * Per-user iCalendar subscription feed tokens.
 *
 * The token is an unguessable bearer capability embedded in the feed URL —
 * calendar apps fetch it without a session, so possession of the URL is the
 * only credential. It grants read-only access to the user's own event feed
 * and nothing else, and can be revoked by resetting it.
 */

/** 32 random bytes, URL-safe — ~256 bits, safe to drop in a URL path. */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The user's feed token, creating one on first use. */
export async function getOrCreateFeedToken(userId: string): Promise<string> {
  const [existing] = await db
    .select({ token: calendarFeeds.token })
    .from(calendarFeeds)
    .where(eq(calendarFeeds.userId, userId))
    .limit(1);
  if (existing) return existing.token;

  const token = generateToken();
  const [row] = await db
    .insert(calendarFeeds)
    .values({ userId, token })
    // A concurrent create for the same user wins; return whatever's stored.
    .onConflictDoNothing({ target: calendarFeeds.userId })
    .returning({ token: calendarFeeds.token });
  if (row) return row.token;

  const [current] = await db
    .select({ token: calendarFeeds.token })
    .from(calendarFeeds)
    .where(eq(calendarFeeds.userId, userId))
    .limit(1);
  return current!.token;
}

/** Replace the user's token, invalidating any previously-shared URL. */
export async function resetFeedToken(userId: string): Promise<string> {
  const token = generateToken();
  await db
    .insert(calendarFeeds)
    .values({ userId, token })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { token } });
  return token;
}

/** The user id a feed token belongs to, or null if the token is unknown. */
export async function getUserIdByFeedToken(
  token: string,
): Promise<string | null> {
  if (!token) return null;
  const [row] = await db
    .select({ userId: calendarFeeds.userId })
    .from(calendarFeeds)
    .where(eq(calendarFeeds.token, token))
    .limit(1);
  return row?.userId ?? null;
}
