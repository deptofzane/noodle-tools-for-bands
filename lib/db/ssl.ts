/**
 * Postgres SSL configuration from env, shared by the pool, the
 * LISTEN/NOTIFY client, and the deploy migrator.
 *
 * - Local dev (Docker Postgres): leave `DATABASE_SSL` unset → no SSL.
 * - Managed production Postgres: set `DATABASE_SSL=true`. Most providers
 *   present a CA that Node trusts, so the default verifies the cert.
 *   If your provider uses a self-signed/internal cert (a common gotcha
 *   on some managed Postgres), set `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
 */
export function pgSslConfig(): false | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL !== 'true') return false;
  return {
    rejectUnauthorized:
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}
