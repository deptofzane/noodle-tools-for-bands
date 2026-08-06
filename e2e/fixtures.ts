/**
 * The band the E2E suite works with.
 *
 * Everything here is namespaced so a failed run leaves something obviously
 * disposable behind rather than data that looks real.
 */
export const E2E = {
  email: 'e2e-player@sidestage.test',
  password: 'e2e-password-9f2a',
  name: 'E2E Player',
  bandName: 'E2E Test Band',
  songName: 'E2E Original Title',
  renamedSong: 'E2E Renamed Title',
  setlistName: 'E2E Set',
} as const;

/** Where `seed()` records the ids it created, for the specs to read. */
export const SEED_FILE = 'e2e/.auth/seed.json';

export interface SeedIds {
  userId: string;
  bandId: string;
  songId: string;
  setlistId: string;
}

/** The seeded ids. Throws rather than guessing if setup didn't run. */
export function readSeed(): SeedIds {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  return JSON.parse(readFileSync(SEED_FILE, 'utf8')) as SeedIds;
}
