/**
 * Production migration runner.
 *
 * Applies the committed Drizzle migrations using the drizzle-orm runtime
 * migrator + node-postgres — both production dependencies — so it works
 * in a deploy/release step WITHOUT drizzle-kit or tsx (which are dev
 * deps and may be pruned in production).
 *
 * Reads DATABASE_URL (+ optional DATABASE_SSL / DATABASE_SSL_REJECT_
 * UNAUTHORIZED) from the environment. Run as the release command:
 *
 *   node scripts/migrate.mjs
 *
 * Locally you can point it at .env.local:
 *
 *   node --env-file=.env.local scripts/migrate.mjs
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Pool } = pg;

function pgSslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return false;
  return {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: pgSslConfig(), max: 1 });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('[migrate] migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
