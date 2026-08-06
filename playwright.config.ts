import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests, run against a *production* build.
 *
 * That isn't a preference: the service worker is disabled in development
 * (see next.config.ts), and the offline setlist feature is the main thing
 * these tests exist to protect. Run in dev, the offline spec would pass
 * without exercising anything.
 *
 * The suite seeds and tears down its own band in the same database the node
 * tests use — `globalSetup` below.
 */
const PORT = 3123;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The specs share seeded data and one signed-in session; running them in
  // parallel against one database invites the interference the node suite
  // already avoids with --test-concurrency=1.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // Offline setlists are a phone feature; test them on a phone-shaped
    // viewport so the mobile-only controls are the ones being driven.
    ...devices['Pixel 7'],
  },

  projects: [
    // Signs in once and saves the session for everything after it.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'app',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
      testIgnore: /auth\.setup\.ts/,
    },
  ],

  webServer: {
    // Build then serve. Slow, and the only honest way to test a service worker.
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
