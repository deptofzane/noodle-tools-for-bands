import { db } from './index';
import { users } from './schema';

export async function upsertUser(input: {
  googleSub: string;
  email?: string | null;
  name?: string | null;
}): Promise<void> {
  await db
    .insert(users)
    .values({
      googleSub: input.googleSub,
      email: input.email ?? null,
      name: input.name ?? null,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: { email: input.email ?? null, name: input.name ?? null },
    });
}