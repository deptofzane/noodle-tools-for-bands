import { test, expect } from '@playwright/test';

/**
 * The Calendar's two actions collapse into a ⋯ menu on a phone, where the
 * header row can't hold them beside the month nav. Desktop keeps the buttons.
 */
test('on a phone they live in the ⋯ menu, and Events is renamed', async ({
  page,
}) => {
  await page.goto('/calendar');
  // Not inline at this width.
  await expect(page.getByRole('link', { name: 'Add event' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Calendar actions' }).click();
  const menu = page.getByRole('menu');
  // "Events" is called "View events" here.
  await expect(
    menu.getByRole('menuitem', { name: 'View events' }),
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: 'Events', exact: true }),
  ).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Add event' })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Add event' }).click();
  await expect(page).toHaveURL(/\/calendar\/events\/new$/);
});

test.describe('desktop', () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test('keeps both buttons inline, with no ⋯ menu', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('link', { name: 'Add event' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Events' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Calendar actions' }),
    ).toHaveCount(0);
  });
});
