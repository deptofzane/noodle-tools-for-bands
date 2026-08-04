import { Agent } from 'node:https';
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
 *
 * "Premature close" handling
 * --------------------------
 * gaxios runs on node-fetch (server-side `window.fetch` is absent), and
 * a connection that dies mid-body surfaces as a node-fetch error:
 * `Invalid response body while trying to fetch <url>: Premature close`.
 * The dominant cause is keep-alive socket reuse: Node pools a TCP/TLS
 * connection, Google (or an intermediary) idles it out and half-closes
 * it, and the next request grabs that dead socket and the body stream
 * terminates early.
 *
 * gaxios already classifies this as a retryable "no-response" error, so
 * the missing piece isn't *whether* we retry — it's that naive retries
 * reuse the same poisoned pool. Two changes fix that:
 *
 *  1. A tuned keep-alive agent (`KEEPALIVE_AGENT`) below:
 *       - `scheduling: 'lifo'` reuses the most-recently-used socket
 *         first, so freshly-validated connections stay hot and stale
 *         idle ones sink to the bottom and age out.
 *       - `timeout` closes idle sockets client-side so we stop reusing
 *         a connection long after the peer would have dropped it (e.g.
 *         after the laptop sleeps).
 *  2. A higher `noResponseRetries` so that, even when several pooled
 *     sockets are stale at once, retries (with backoff) outlast the
 *     bad pool and land on a freshly-created connection.
 */

/**
 * Shared HTTPS keep-alive agent for all googleapis traffic. Installed
 * globally via `google.options` so every Drive (and token) request uses
 * it. See the "Premature close" note above for the rationale.
 */
const KEEPALIVE_AGENT = new Agent({
  keepAlive: true,
  // Prefer the most-recently-used free socket; stale idle sockets sink
  // and get evicted rather than handed to the next request.
  scheduling: 'lifo',
  // Close a socket after 60s of inactivity. Long enough not to disrupt
  // active audio streaming (data resets the timer), short enough that we
  // don't reuse a connection the server has already silently dropped.
  timeout: 60_000,
  // Bound the idle pool so there are fewer potentially-stale sockets to
  // drain after an idle period.
  maxFreeSockets: 32,
});

// Route all googleapis requests through the tuned agent. Idempotent;
// safe to call at module load.
google.options({ agent: KEEPALIVE_AGENT });

const RETRY_CONFIG = {
  retry: 3,
  retryDelay: 250, // ms; gaxios doubles this per attempt (exponential backoff)
  // Premature-close / socket errors arrive with no HTTP response, so
  // they're governed by this counter (not `retry`/`statusCodesToRetry`).
  // gaxios defaults this to 2; we raise it so retries outlast a fully
  // stale socket pool (e.g. after the machine wakes from sleep).
  noResponseRetries: 5,
  httpMethodsToRetry: [
    'GET',
    'HEAD',
    'OPTIONS',
    'PUT',
    'PATCH',
    'POST',
    'DELETE',
  ],
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
