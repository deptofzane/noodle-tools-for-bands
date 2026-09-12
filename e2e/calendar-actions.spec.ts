import { test, expect } from '@playwright/test';

/**
 * The Calendar panel's action collapses into a ⋯ menu on a phone, where the
 * header row can't hold it beside the month nav. Desktop keeps the button.
 *
 * Reaching the event *list* is the Events pill's job now, so neither the
 * inline "Events" button nor its "View events" menu item exists — and both
 * absences are asserted, since a stale duplicate beside the pill is exactly
 * what this move was meant to remove.
 */
test('on a phone Add event lives in the ⋯ menu', async ({ page }) => {
  await page.goto('/scheduling');
  // Not inline at this width.
  await expect(page.getByRole('link', { name: 'Add event' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Calendar actions' }).click();
  const menu = page.getByRole('menu');
  await expect(
    menu.getByRole('menuitem', { name: 'View events' }),
  ).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Add event' })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Add event' }).click();
  await expect(page).toHaveURL(/\/scheduling\/events\/new$/);
});

test.describe('desktop', () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test('keeps Add event inline, with no ⋯ menu', async ({ page }) => {
    await page.goto('/scheduling');
    await expect(page.getByRole('link', { name: 'Add event' })).toBeVisible();
    // The event list is the Events pill, not a button beside the month nav.
    await expect(page.getByRole('link', { name: 'Events' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Calendar actions' }),
    ).toHaveCount(0);
  });
});
