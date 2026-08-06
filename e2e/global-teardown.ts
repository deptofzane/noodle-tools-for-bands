import '../scripts/load-env';
import { closeDb } from '../lib/db';
import { closeObjectStore } from '../lib/storage/s3';
import { clearSeed } from './seed';

export default async function globalTeardown() {
  try {
    await clearSeed();
  } finally {
    closeObjectStore();
    await closeDb();
  }
}
