import { and, eq, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from './index';
import { accounts, users } from './schema';
import { normalizeEmail, type DbUser } from './users';

/**
 * Linked OAuth accounts. `accounts` is the source of truth for OAuth
 * sign-in identity (currently just Google), decoupled from a user's
 * credential login email — so a user can connect a Google account whose
 * email differs from the one they log in with.
 */

export type AuthProvider = (typeof accounts.provider.enumValues)[number];

export interface LinkedAccount {
  id: string;
  userId: string;
  provider: AuthProvider;
  providerAccountId: string;
  email: string | null;
}

/** The account row for a provider identity, or null if unlinked. */
export async function getAccountByProvider(
  provider: AuthProvider,
  providerAccountId: string,
): Promise<LinkedAccount | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, provider),
        eq(accounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A user's linked account for a provider (at most one per provider here). */
export async function getUserAccount(
  userId: string,
  provider: AuthProvider,
): Promise<LinkedAccount | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve (or create) the user for a Google sign-in.
 *
 *   1. If the Google account is already linked → that user.
 *   2. Else if a user already exists with the Google account's (verified)
 *      email → link it to that user. This is safe because Google emails are
 *      verified, and it lets an email/password user sign in with Google
 *      using the same address without a manual link.
 *   3. Else → create a fresh user + linked account.
 */
export async function findOrCreateGoogleUser(input: {
  sub: string;
  email?: string | null;
  name?: string | null;
}): Promise<DbUser> {
  const email = input.email ? normalizeEmail(input.email) : null;

  const existing = await getAccountByProvider('google', input.sub);
  if (existing) {
    // Already linked — just return the user. We deliberately DON'T update
    // `name` here: a Google login must not overwrite a name the user set
    // (or wipe it to null when Google omits `name` on a later grant).
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, existing.userId))
      .limit(1);
    return user!;
  }

  return db.transaction(async (tx) => {
    let user: DbUser | undefined;
    if (email) {
      [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
    }
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ email, name: input.name ?? null })
        .returning();
    }
    await insertGoogleAccount(tx, user!.id, input.sub, email);
    return user!;
  });
}

async function insertGoogleAccount(
  exec: DbExecutor,
  userId: string,
  sub: string,
  email: string | null,
): Promise<void> {
  await exec
    .insert(accounts)
    .values({ userId, provider: 'google', providerAccountId: sub, email })
    .onConflictDoNothing();
}

/**
 * Delete the users linked to these Google subs (cascades their data).
 * Convenience for tests/fixtures that seed users via a Google identity.
 */
export async function deleteUsersByGoogleSub(subs: string[]): Promise<void> {
  if (subs.length === 0) return;
  const rows = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, 'google'),
        inArray(accounts.providerAccountId, subs),
      ),
    );
  const ids = [...new Set(rows.map((r) => r.userId))];
  if (ids.length) await db.delete(users).where(inArray(users.id, ids));
}

export class GoogleAccountConflictError extends Error {
  constructor(message = 'That Google account is already linked to another account.') {
    super(message);
    this.name = 'GoogleAccountConflictError';
  }
}

export class AlreadyLinkedError extends Error {
  constructor(message = 'This account already has a Google account linked.') {
    super(message);
    this.name = 'AlreadyLinkedError';
  }
}

/**
 * Explicitly link a Google account to `userId` (used from Settings; the
 * Google email may differ from the user's login email).
 *
 * Rejects if that Google account already belongs to a *different* user, or
 * if this user already has a *different* Google account linked. A no-op if
 * it's already linked to this same user.
 */
export async function linkGoogleAccount(
  userId: string,
  sub: string,
  googleEmail: string | null,
): Promise<void> {
  const existing = await getAccountByProvider('google', sub);
  if (existing) {
    if (existing.userId !== userId) throw new GoogleAccountConflictError();
    return; // already linked to this user
  }
  const current = await getUserAccount(userId, 'google');
  if (current && current.providerAccountId !== sub) {
    throw new AlreadyLinkedError();
  }

  // Plain insert (not onConflictDoNothing): the unique indexes on accounts
  // are the real guardrail against a race between the checks above and this
  // write. On a violation, re-resolve to the correct typed error.
  try {
    await db.insert(accounts).values({
      userId,
      provider: 'google',
      providerAccountId: sub,
      email: googleEmail ? normalizeEmail(googleEmail) : null,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const now = await getAccountByProvider('google', sub);
    if (now && now.userId !== userId) throw new GoogleAccountConflictError();
    if (now && now.userId === userId) return; // linked concurrently for us
    throw new AlreadyLinkedError(); // user got a different Google account
  }
}

/** True if the error is a Postgres unique-constraint violation (23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export class LastSignInMethodError extends Error {
  constructor(
    message = 'Set a password before disconnecting Google, so you can still sign in.',
  ) {
    super(message);
    this.name = 'LastSignInMethodError';
  }
}

/**
 * Unlink the user's Google account. Refuses if they have no password set,
 * since that would leave them with no way to sign in.
 */
export async function unlinkGoogleAccount(userId: string): Promise<void> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.passwordHash) throw new LastSignInMethodError();
  await db
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')));
}
