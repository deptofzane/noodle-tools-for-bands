import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import { hashPassword } from '../password';

export type DbUser = typeof users.$inferSelect;

/** Emails are stored + compared lowercased so login/lookup is case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve (or create) a user for a Google sign-in. Thin wrapper over
 * `findOrCreateGoogleUser` in the accounts layer; kept for callers/tests
 * that just need a user for a given Google `sub`.
 */
export async function upsertUser(input: {
  googleSub: string;
  email?: string | null;
  name?: string | null;
}): Promise<DbUser> {
  const { findOrCreateGoogleUser } = await import('./accounts');
  return findOrCreateGoogleUser({
    sub: input.googleSub,
    email: input.email,
    name: input.name,
  });
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
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