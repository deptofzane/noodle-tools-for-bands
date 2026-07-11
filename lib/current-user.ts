import { auth } from '@/auth';
import { getUserById, type DbUser } from '@/lib/db/users';

/**
 * The DB user for the current session, or null if unauthenticated.
 *
 * `session.user.sub` is the DB user id (set for both Google and email/password
 * sign-ins), so identity is provider-agnostic here.
 */
export async function getCurrentDbUser(): Promise<DbUser | null> {
  const session = await auth();
  if (!session?.user?.sub) return null;
  return getUserById(session.user.sub);
}