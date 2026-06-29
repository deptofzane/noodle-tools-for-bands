import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';

export type DbUser = typeof users.$inferSelect;

export async function upsertUser(input: {
  googleSub: string;
  email?: string | null;
  name?: string | null;
}): Promise<DbUser> {
  const [row] = await db
    .insert(users)
    .values({
      googleSub: input.googleSub,
      email: input.email ?? null,
      name: input.name ?? null,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email: input.email ?? null, name: input.name ?? null },
    })
    .returning();
  return row!;
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

// email isn't a DB unique constraint, but it's effectively unique per
// Google account, so limit(1) is fine for "add member by email".
export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}