import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';

/**
 * Returns the user's current Google OAuth access token. Used by the
 * client-side Google Picker, which needs a real token to open a Drive
 * file chooser on the user's behalf.
 *
 * Security:
 *   - Requires an authenticated session (middleware also enforces this)
 *   - Requires the `drive.file` scope to be granted; otherwise the
 *     client should kick the user to the "connect Drive" flow
 *   - Surfaces token-refresh errors so the UI can prompt re-auth
 *
 * The access token is short-lived (~1 hour) and scoped narrowly to
 * `drive.file`. The refresh token is never exposed here.
 */
export async function GET() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  if (session.error === 'RefreshAccessTokenError') {
    return NextResponse.json(
      { error: 'refresh_failed', message: 'Please sign in again.' },
      { status: 401 },
    );
  }

  if (!hasAllDriveScopes(session.scopes)) {
    return NextResponse.json(
      { error: 'scope_missing', message: 'Drive access not granted.' },
      { status: 403 },
    );
  }

  if (!session.accessToken) {
    return NextResponse.json(
      { error: 'no_token', message: 'No access token available.' },
      { status: 401 },
    );
  }

  return NextResponse.json({ accessToken: session.accessToken });
}
