import { test, expect } from '@playwright/test';

test.describe('help: the ⋯ menu section', () => {
  test('renders on the page and in the dialog', async ({ page }) => {
    await page.goto('/help');
    await expect(
      page.getByRole('heading', { name: 'The ⋯ menu' }),
    ).toBeVisible();
    await expect(page.getByText('Song', { exact: true })).toBeVisible();

    // Same text, reached the other way.
    await page.goto('/home');
    await page.getByRole('button', { name: /^Menu/ }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();
    const dialog = page.getByRole('dialog', { name: 'Help' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'The ⋯ menu' }),
    ).toBeVisible();
  });

  test('the example is inert: no controls, nothing to focus', async ({
    page,
  }) => {
    await page.goto('/help');
    const example = page
      .locator('[aria-hidden="true"]')
      .filter({ hasText: 'Song' })
      .first();
    await expect(example).toBeAttached();

    // Six glyphs, two rows of three.
    expect(await example.locator('svg').count()).toBe(6);
    // Nothing clickable or reachable by keyboard inside it.
    expect(await example.locator('button, a, [role="menuitem"]').count()).toBe(
      0,
    );
    expect(
      await example.locator('[tabindex]:not([tabindex="-1"])').count(),
    ).toBe(0);
  });

  test('the words carry it for screen readers', async ({ page }) => {
    await page.goto('/help');
    // The visual is aria-hidden, so the explanation must stand alone.
    await expect(page.getByText(/opens it for editing/)).toBeVisible();
    await expect(page.getByText(/random order/)).toBeVisible();
    await expect(page.getByText(/already playing/)).toBeVisible();
  });
});
