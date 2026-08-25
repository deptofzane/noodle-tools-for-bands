import { test, expect } from '@playwright/test';

/**
 * The Help dialog's history handling.
 *
 * It pushes a history entry so the system back gesture dismisses the panel
 * instead of leaving the page. The hazard is that `history.back()` is async:
 * a pop the dialog asked for can arrive after its own listener is back in
 * place, and be misread as the user's.
 */
test.describe('help dialog', () => {
  test('opens from the nav and stays open', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: /^Menu/ }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();

    const dialog = page.getByRole('dialog', { name: 'Help' });
    await expect(dialog).toBeVisible();
    // Long enough for a queued popstate to have landed and closed it.
    await page.waitForTimeout(500);
    await expect(dialog).toBeVisible();
  });

  test('back closes it and stays on the page', async ({ page }) => {
    await page.goto('/home');
    const before = page.url();
    await page.getByRole('button', { name: /^Menu/ }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeHidden();
    expect(page.url()).toBe(before);
  });

  test('closing leaves history where it started', async ({ page }) => {
    await page.goto('/home');
    await page.goto('/settings');
    await page.getByRole('button', { name: /^Menu/ }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();

    await page.getByRole('button', { name: 'Close help' }).click();
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeHidden();

    // What it pushed, it popped: back goes to the previous page, not to a
    // leftover entry of its own.
    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('survives a re-render of the nav that owns it', async ({ page }) => {
    // The regression guard. `Header` renders this dialog and passes a fresh
    // `onClose` arrow on every one of its own renders, so an effect keyed on
    // that prop tears down and re-runs mid-open — popping the history entry
    // and then reading the resulting popstate as the user's back.
    //
    // Toggling the nav menu is a pure `Header` state change, which is exactly
    // the trigger; it's clicked directly because the dialog covers the bar.
    await page.goto('/home');
    await page.getByRole('button', { name: /^Menu/ }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();
    const dialog = page.getByRole('dialog', { name: 'Help' });
    await expect(dialog).toBeVisible();

    await page.evaluate(() => {
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-controls="app-nav-menu"]',
        )
        ?.click();
    });
    await page.waitForTimeout(500);
    await expect(dialog).toBeVisible();
  });

  test('escape closes it', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: /^Menu/ }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Help' })).toBeHidden();
  });
});
