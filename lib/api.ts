/**
 * Small helpers for turning a `fetch` Response into a thrown Error with a
 * useful message. Our API routes return `{ message }` (or `{ error }`) on
 * failure; fall back to the HTTP status when the body has neither.
 *
 * Isomorphic — safe from client components and server code alike.
 */

export async function errorMessage(res: Response): Promise<string> {
  const b = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
  };
  return b.message ?? b.error ?? `HTTP ${res.status}`;
}

/**
 * Throw with the parsed error message unless the response is ok — or its
 * status is in `allow` (e.g. `[204]` for deletes that return no content).
 */
export async function ensureOk(
  res: Response,
  allow: number[] = [],
): Promise<void> {
  if (res.ok || allow.includes(res.status)) return;
  throw new Error(await errorMessage(res));
}
