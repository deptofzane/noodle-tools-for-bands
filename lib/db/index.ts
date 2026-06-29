import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { __pool?: Pool };

const pool =
  globalForDb.__pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

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