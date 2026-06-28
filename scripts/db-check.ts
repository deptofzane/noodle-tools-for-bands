import './load-env';            // side-effect import; runs before the ones below
import { sql } from 'drizzle-orm';
import { db } from '../lib/db';

async function main() {
  const result = await db.execute(sql`select 1 as ok`);
  console.log('DB OK:', result.rows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });