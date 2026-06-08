import { google, type drive_v3 } from 'googleapis';

/**
 * Drive client factory.
 *
 * This module uses the `googleapis` Node SDK, which pulls in Node
 * built-ins (`node:process`, `node:fs`, etc.). That means it CANNOT be
 * imported from any code path that runs in the Edge runtime — most
 * notably `middleware.ts` and `auth.ts` (which middleware depends on).
 *
 * If you find yourself importing from this file in an Edge context,
 * stop and move the Drive call into a Node-runtime API route, or pull
 * the helper you need into `lib/google.ts` if it doesn't actually need
 * `googleapis`.
 *
 * Node-runtime callers today: every route under `app/api/drive/` and
 * `app/api/files/`.
 *
 * Rate limit handling: googleapis uses gaxios under the hood, which
 * supports automatic retries on 429 and 5xx with exponential backoff.
 * Defaults retry only GET/HEAD/OPTIONS/PUT — we extend that to include
 * POST/PATCH/DELETE because all our write operations are either
 * idempotent (PATCH/PUT update, DELETE) or driven by find-or-create
 * patterns where a retry after a 429 is safe (the failed request
 * didn't reach Drive's storage layer).
 */

const RETRY_CONFIG = {
  retry: 3,
  retryDelay: 250, // ms; gaxios doubles this per attempt (exponential backoff)
  httpMethodsToRetry: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
  statusCodesToRetry: [
    [429, 429],
    [500, 599],
  ],
};

/**
 * Make a Drive v3 client authenticated as the given user.
 * The access token must currently be valid; refresh is handled in
 * `auth.ts`'s `jwt` callback before this is ever called.
 */
export function getDriveClient(accessToken: string): drive_v3.Drive {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return google.drive({
    version: 'v3',
    auth: oauth2,
    retryConfig: RETRY_CONFIG,
  });
}
