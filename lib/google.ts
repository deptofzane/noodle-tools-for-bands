/**
 * Google auth + scope helpers.
 *
 * IMPORTANT: this file is imported (transitively) by `auth.ts`, which
 * is in turn imported by `middleware.ts`. Middleware runs in the
 * Next.js Edge runtime, which does NOT permit Node built-ins. Therefore
 * this file MUST stay Edge-compatible — `fetch`, URL, URLSearchParams,
 * Web Crypto, etc. only. No `googleapis`, no `fs`, no `node:*` imports.
 *
 * The actual Drive client (which uses the Node-only `googleapis` SDK)
 * lives in `lib/drive.ts` and is imported only by Node-runtime routes.
 */

/**
 * Per-file scope. Grants the app read+write access to files this app
 * creates, and read access to files the user explicitly picks via the
 * Google Picker. Used to write per-user notes JSON files in Phase 4.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Read-only scope. Grants the app read access to everything the user
 * can see in Drive.
 *
 * Why we need this in addition to `drive.file`:
 *   - Listing children of a picked folder doesn't work with drive.file
 *     alone — Drive grants metadata access to the folder itself but
 *     not to its children, so `files.list({q: "'<id>' in parents"})`
 *     returns empty.
 *   - In the collaborative model (multiple users in a shared folder),
 *     each user needs to read notes files OTHER users created. With
 *     drive.file alone the app would only see notes it created itself.
 *
 * Trade-off: the consent screen now says "view all your Drive files"
 * (broader) instead of just "files you open with this app" (narrow).
 * Worth it for v2's read-the-whole-shared-folder model.
 */
export const DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly';

/** Scopes the app needs to function end-to-end. */
export const REQUIRED_DRIVE_SCOPES = [
  DRIVE_FILE_SCOPE,
  DRIVE_READONLY_SCOPE,
] as const;

export function hasAllDriveScopes(scopes: string[] | undefined): boolean {
  if (!scopes) return false;
  return REQUIRED_DRIVE_SCOPES.every((s) => scopes.includes(s));
}

/** Response shape from Google's token endpoint. */
export interface RefreshedTokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  refresh_token?: string;
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * Called from auth.ts's `jwt` callback when the current access token
 * is within ~60s of expiring. Google may rotate the refresh token on
 * occasion; if so, the caller persists the new one.
 *
 * Throws on any non-2xx; the jwt callback catches and marks the token
 * with `error: 'RefreshAccessTokenError'` so the app can prompt re-auth.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<RefreshedTokenResponse> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not configured');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Token refresh failed: ${res.status} ${await res.text().catch(() => '')}`,
    );
  }

  return (await res.json()) as RefreshedTokenResponse;
}

/**
 * Lightweight runtime check that a string looks like a Drive resource id.
 * Drive ids are URL-safe base64-ish: alphanumerics, dashes, and underscores.
 * We use this to keep user input out of `drive.files.list` queries cleanly.
 */
export function isValidDriveId(id: string): boolean {
  return /^[A-Za-z0-9_-]{5,200}$/.test(id);
}
