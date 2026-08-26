import { test, expect } from '@playwright/test';

/** These pages are public, so they run signed out. */
test.use({ storageState: { cookies: [], origins: [] } });

const field = (p: import('@playwright/test').Page) =>
  p.getByPlaceholder('Password');
const toggle = (p: import('@playwright/test').Page) =>
  p.getByRole('button', { name: /Show password|Hide password/ });

test('the password is masked until revealed', async ({ page }) => {
  await page.goto('/login');
  await expect(field(page)).toHaveAttribute('type', 'password');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
});

test('revealing shows the characters, and hiding masks them again', async ({
  page,
}) => {
  await page.goto('/login');
  await field(page).fill('hunter2');

  await toggle(page).click();
  await expect(field(page)).toHaveAttribute('type', 'text');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  // The value survives the switch — it's the same input, not a swap.
  await expect(field(page)).toHaveValue('hunter2');

  await toggle(page).click();
  await expect(field(page)).toHaveAttribute('type', 'password');
  await expect(field(page)).toHaveValue('hunter2');
});

test('it starts masked again on a fresh visit', async ({ page }) => {
  await page.goto('/login');
  await field(page).fill('hunter2');
  await toggle(page).click();
  await expect(field(page)).toHaveAttribute('type', 'text');

  await page.reload();
  await expect(field(page)).toHaveAttribute('type', 'password');
});

test('tabbing from the password field reaches Sign in, not the toggle', async ({
  page,
}) => {
  await page.goto('/login');
  // Both fields: Sign in is disabled until they're filled, and a disabled
  // button is skipped in the tab order — which would mask what's being tested.
  await page.getByPlaceholder('Email').fill('someone@example.test');
  await field(page).fill('hunter2');
  await field(page).focus();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? '',
  );
  expect(focused).toContain('Sign in with email');
});

/*
 * The same control on the two pages where it matters most: on signup and
 * reset you're typing a password you've never typed before, so there's no
 * muscle memory to check it against.
 */
for (const [page_, url, placeholder] of [
  ['signup', '/signup', 'Password (min 8 characters)'],
  ['reset', '/reset?token=irrelevant', 'New password (min 8 characters)'],
] as const) {
  test(`${page_} has the same reveal`, async ({ page }) => {
    await page.goto(url);
    const input = page.getByPlaceholder(placeholder);
    await expect(input).toHaveAttribute('type', 'password');

    await input.fill('correct horse battery');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveValue('correct horse battery');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test(`${page_} keeps new-password autocomplete`, async ({ page }) => {
    // Signing up and resetting should offer a *generated* password, not the
    // saved one — that's what `new-password` tells the password manager.
    await page.goto(url);
    await expect(page.getByPlaceholder(placeholder)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
}
