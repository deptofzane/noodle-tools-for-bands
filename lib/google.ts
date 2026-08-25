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
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Scopes the app needs to function end-to-end.
 *
 * `drive.file` only. We previously also asked for `drive.readonly` ("view all
 * your Drive files") for two reasons that no longer exist: listing the
 * children of a picked folder, and reading notes files other users had
 * created in a shared folder. The app never lists folder children — there is
 * no `files.list` call anywhere — and notes moved to Postgres, so every Drive
 * request is now `files.get`/`files.export` on a file the user handed us
 * through the Picker, which is exactly what `drive.file` covers.
 *
 * Keeping it narrow is worth real money and time: `drive.readonly` is a
 * *restricted* scope, and publishing a consent screen with one requires a
 * third-party CASA security assessment. `drive.file` is not restricted.
 *
 * The Picker must be built with `setAppId` for this to hold — see
 * `googlePickerAppId` below.
 */
export const REQUIRED_DRIVE_SCOPES = [DRIVE_FILE_SCOPE] as const;

/**
 * The Cloud project number, which the Google Picker needs as its "app id".
 *
 * Without it, files chosen in the Picker are NOT granted to the app under
 * `drive.file`, and every later `files.get` on them 404s. (That went unnoticed
 * while we also held `drive.readonly`, which covered those reads on its own.)
 *
 * The project number is the numeric prefix of the OAuth client id
 * (`123456789012-abcdef.apps.googleusercontent.com`), so it's derived rather
 * than configured separately — one less env var to get wrong. Read on the
 * server so it follows runtime config like the Picker API key does.
 */
export function googlePickerAppId(): string {
  return process.env.AUTH_GOOGLE_ID?.match(/^(\d+)-/)?.[1] ?? '';
}

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
 * The outcome of a refresh attempt.
 *
 * `dead` means the refresh token will never work again, so the only way
 * forward is for the user to reconnect Google. `transient` means Google was
 * unavailable or rate-limiting and the same token is worth retrying.
 */
export type RefreshResult =
  | { ok: true; tokens: RefreshedTokenResponse }
  | { ok: false; reason: 'dead' | 'transient'; detail: string };

/**
 * Exchange a refresh token for a fresh access token.
 *
 * Called from auth.ts's `jwt` callback when the current access token is
 * within ~60s of expiring. Google may rotate the refresh token; if so, the
 * caller persists the new one.
 *
 * Returns a result rather than throwing, because the two failure modes need
 * opposite handling and the caller can't tell them apart from an exception.
 * The one that bites in practice is `invalid_grant`, which means the refresh
 * token is gone for good — the user revoked access, or the OAuth consent
 * screen is still in "Testing", where Google expires refresh tokens after
 * seven days. Retrying that forever just means a round-trip to Google on
 * every request, so the caller drops the credentials instead.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    // Misconfiguration, not a bad token: don't discard the user's grant over
    // it, since it'll work again once the env is fixed.
    return {
      ok: false,
      reason: 'transient',
      detail: 'AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not configured',
    };
  }

  let res: Response;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'transient',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 5xx and 429 are Google having a moment. Every other 4xx is a verdict on
    // the grant itself (`invalid_grant`, `invalid_client`, …) and won't change
    // on retry.
    const transient = res.status >= 500 || res.status === 429;
    return {
      ok: false,
      reason: transient ? 'transient' : 'dead',
      detail: `${res.status} ${body}`.trim(),
    };
  }

  return { ok: true, tokens: (await res.json()) as RefreshedTokenResponse };
}
