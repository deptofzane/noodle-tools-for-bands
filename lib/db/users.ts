import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import { hashPassword } from '../password';

export type DbUser = typeof users.$inferSelect;

/** Emails are stored + compared lowercased so login/lookup is case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function upsertUser(input: {
  googleSub: string;
  email?: string | null;
  name?: string | null;
}): Promise<DbUser> {
  const email = input.email ? normalizeEmail(input.email) : null;
  const [row] = await db
    .insert(users)
    .values({ googleSub: input.googleSub, email, name: input.name ?? null })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email, name: input.name ?? null },
    })
    .returning();
  return row!;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getUserByGoogleSub(
  googleSub: string,
): Promise<DbUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, googleSub))
    .limit(1);
  return row ?? null;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export class EmailTakenError extends Error {
  constructor(message = 'That email is already registered.') {
    super(message);
    this.name = 'EmailTakenError';
  }
}

/**
 * Create a user who signs in with email + password. Rejects if the email is
 * already taken — including by a Google account (they should sign in with
 * Google rather than create a duplicate).
 */
export async function createCredentialUser(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<DbUser> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) throw new EmailTakenError();
  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({ email, passwordHash, name: input.name ?? null })
    .returning();
  return row!;
}

/** Set (or replace) a user's password — used by the reset flow. */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}