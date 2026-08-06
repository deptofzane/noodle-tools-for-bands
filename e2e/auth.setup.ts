import '../scripts/load-env';
import { test as setup, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { getUserByEmail } from '../lib/db/users';
import { E2E } from './fixtures';

const STATE = 'e2e/.auth/user.json';
/** Auth.js v5's default name over http. HTTPS would prefix `__Secure-`. */
const COOKIE = 'authjs.session-token';

/**
 * Signs in by minting the session cookie directly.
 *
 * Not through the UI: the login page offers Google only — the credentials form
 * is commented out of `app/login/page.tsx` pending email setup — and an OAuth
 * round trip to Google isn't something a test should drive. So this builds the
 * same JWT the `jwt` callback would, using the same secret.
 *
 * The tradeoff is that these tests don't cover signing in. That's worth a spec
 * of its own once the credentials form is enabled.
 */
setup('sign in', async ({ page, context }) => {
  const user = await getUserByEmail(E2E.email);
  if (!user) throw new Error('E2E user missing — did global setup run?');

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required to mint a session');

  const token = await encode({
    token: { sub: user.id, email: user.email, name: user.name },
    secret,
    salt: COOKIE,
    maxAge: 60 * 60,
  });

  await context.addCookies([
    {
      name: COOKIE,
      value: token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // Prove the cookie is actually accepted rather than assuming it.
  await page.goto('/bands');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(E2E.bandName).first()).toBeVisible({
    timeout: 20_000,
  });

  await context.storageState({ path: STATE });
});
