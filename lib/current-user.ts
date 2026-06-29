import { auth } from '@/auth';
import { getUserByGoogleSub, type DbUser } from '@/lib/db/users';

/** The DB user for the current session, or null if unauthenticated. */
export async function getCurrentDbUser(): Promise<DbUser | null> {
  const session = await auth();
  if (!session?.user?.sub) return null;
  return getUserByGoogleSub(session.user.sub);
}