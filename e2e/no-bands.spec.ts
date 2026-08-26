import '../scripts/load-env';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { createCredentialUser, getUserByEmail } from '../lib/db/users';

const COOKIE = 'authjs.session-token';
const BANDLESS = {
  email: 'e2e-bandless@noodle.test',
  password: 'e2e-password-bandless-1',
  name: 'E2E Bandless',
};

/**
 * A user who belongs to no band — the state a new account starts in, which
 * the seeded user can't represent because it owns one.
 */
test.beforeAll(async () => {
  if (!(await getUserByEmail(BANDLESS.email)))
    await createCredentialUser(BANDLESS);
});

/** Signed out by default; each test mints its own session below. */
test.use({ storageState: { cookies: [], origins: [] } });

async function signInBandless(context: BrowserContext) {
  const user = await getUserByEmail(BANDLESS.email);
  if (!user) throw new Error('bandless user missing');
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required');
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
}

const openMenu = async (p: Page) => {
  await p.getByRole('button', { name: /^Menu/ }).click();
  return p.getByRole('menu');
};

test('with no bands, the menu offers Create a band', async ({
  page,
  context,
}) => {
  await signInBandless(context);
  await page.goto('/home');
  const menu = await openMenu(page);

  const create = menu.getByRole('menuitem', { name: 'Create a band' });
  await expect(create).toBeVisible();
  await expect(create).toHaveAttribute('href', '/bands');

  /*
   * The Band switcher has nothing to switch between, so it isn't offered.
   * Start-anchored: its real name is "Band <current band>", and a loose
   * 'Band' would also match "Create a band" and never fail.
   */
  await expect(menu.getByRole('menuitem', { name: /^Band\s/ })).toHaveCount(0);
});

test('it lands on the bands page', async ({ page, context }) => {
  await signInBandless(context);
  await page.goto('/home');
  const menu = await openMenu(page);
  await menu.getByRole('menuitem', { name: 'Create a band' }).click();
  await expect(page).toHaveURL(/\/bands$/);
});

test('a user who has a band gets the switcher, not Create a band', async ({
  page,
}) => {
  // Signed in as the seeded user (the project's storageState), who owns one.
  const ctx = await page.context().browser()!.newContext({
    storageState: 'e2e/.auth/user.json',
  });
  const p = await ctx.newPage();
  await p.goto('/home');
  await p.getByRole('button', { name: /^Menu/ }).click();
  const menu = p.getByRole('menu');

  await expect(menu.getByRole('menuitem', { name: /^Band\s/ })).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: 'Create a band' }),
  ).toHaveCount(0);
  await ctx.close();
});
