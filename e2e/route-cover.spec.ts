import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { slowNavigations } from './helpers';

/**
 * The navigation cover: a page that takes a while to arrive is replaced by a
 * spinner rather than leaving the old screen up. See app/RouteProgress.tsx.
 */
const seed = readSeed();
const cover = (p: import('@playwright/test').Page) =>
  p.getByRole('status', { name: 'Loading page' });

test('a slow navigation swaps the page for a spinner until it lands', async ({
  page,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await slowNavigations(page);
  await page.getByRole('link', { name: 'Live', exact: true }).click();

  await expect(cover(page)).toBeVisible();
  await expect(page.locator('main')).toBeHidden();

  await expect(page).toHaveURL(/\/live/);
  await expect(cover(page)).toHaveCount(0);
});

test('a fast navigation never shows it', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  let shown = false;
  await page.exposeFunction('coverShown', () => (shown = true));
  await page.evaluate(() => {
    new MutationObserver(() => {
      const el = document.querySelector('.route-cover');
      if (el && getComputedStyle(el).opacity !== '0') {
        (window as unknown as { coverShown: () => void }).coverShown();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('link', { name: 'Live', exact: true }).click();
  await expect(page).toHaveURL(/\/live/);
  expect(shown).toBe(false);
});

test('a tap dismisses a cover that has outstayed its navigation', async ({
  page,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  // A navigation that never lands.
  await page.route(
    (url) => url.searchParams.has('_rsc'),
    () => new Promise(() => {}),
  );
  await page.getByRole('link', { name: 'Live', exact: true }).click();
  await expect(cover(page)).toBeVisible();

  // Its background, not the ring: a spinning element never holds still
  // enough for a click.
  await page.locator('.route-cover').click({ position: { x: 10, y: 10 } });
  await expect(cover(page)).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
});
