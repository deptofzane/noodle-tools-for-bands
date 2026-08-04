import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { pgSslConfig } from './ssl';

const globalForDb = globalThis as unknown as { __pool?: Pool };

const pool =
  globalForDb.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    ssl: pgSslConfig(),
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });

/**
 * The drizzle DB handle OR a transaction handle. Lets shared helpers
 * (recordActivity, mention inserts, etc.) run either standalone or
 * inside a `db.transaction(...)` callback.
 */
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<(typeof db)['transaction']>[0]>[0];

/**
 * Close the connection pool. App code never calls this (the server is
 * long-lived); it exists so one-off scripts and the integration tests can
 * let their process exit instead of hanging on open connections.
 */
export async function closeDb(): Promise<void> {
  await pool.end();
  if (globalForDb.__pool === pool) delete globalForDb.__pool;
}
