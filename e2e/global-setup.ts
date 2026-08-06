// Must come first: importing `lib/db` builds a pool from DATABASE_URL, so the
// environment has to be loaded before anything else pulls it in.
import '../scripts/load-env';
import { seed } from './seed';

/**
 * Leaves the connection pool open on purpose — `global-teardown` runs in this
 * same process and needs it. Closing here would make that a double `end()`.
 */
export default async function globalSetup() {
  await seed();
}
