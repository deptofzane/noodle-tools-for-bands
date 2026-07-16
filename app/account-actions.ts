'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { getCurrentDbUser } from '@/lib/current-user';
import { REQUIRED_DRIVE_SCOPES } from '@/lib/google';
import { LINK_COOKIE, signLinkToken } from '@/lib/link-token';
import { unlinkGoogleAccount } from '@/lib/db/accounts';

/** Only allow same-origin relative return paths (no open redirects). */
function safePath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/settings?tab=account';
}

/**
 * Start connecting a Google account to the signed-in user. Sets the signed
 * "link to me" cookie, then kicks off Google OAuth (with Drive scopes, so
 * the same flow also enables Drive). The auth callbacks read the cookie and
 * attach the account to this user instead of logging in as the Google user.
 */
export async function startGoogleConnect(formData: FormData): Promise<void> {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  const next = safePath(
    typeof formData.get('next') === 'string' ? String(formData.get('next')) : null,
  );

  (await cookies()).set(LINK_COOKIE, signLinkToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  await signIn(
    'google',
    { redirectTo: next },
    {
      scope: ['openid', 'email', 'profile', ...REQUIRED_DRIVE_SCOPES].join(' '),
      include_granted_scopes: 'true',
      access_type: 'offline',
      prompt: 'consent',
    },
  );
}

/**
 * Disconnect the user's Google account. Refuses (redirects with a hint) if
 * they have no password, since that would leave them unable to sign in.
 */
export async function disconnectGoogle(): Promise<void> {
  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  let ok = true;
  try {
    await unlinkGoogleAccount(user.id);
  } catch {
    ok = false;
  }
  redirect(
    ok
      ? '/settings?tab=account&link=disconnected'
      : '/settings?tab=account&link=needs_password',
  );
}
