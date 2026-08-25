import { test, expect } from '@playwright/test';
import { readSeed, E2E } from './fixtures';
import { findOrCreateConversation } from '../lib/db/conversations';

const seed = readSeed();

/** Enough rows that the Songs tab is comfortably taller than a phone screen. */
test.beforeAll(async () => {
  for (let i = 0; i < 40; i++) {
    await findOrCreateConversation(
      seed.bandId,
      `e2e-scroll-${i}`,
      `E2E Scroll Song ${String(i).padStart(2, '0')}`,
    );
  }
});

test('the Songs tab returns to where it was after editing a song', async ({
  page,
}) => {
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  await page.getByText(E2E.songName).first().waitFor();

  await page.evaluate(() => window.scrollTo(0, 900));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(500);
  // A settled scroll is what gets remembered, so pause as a reader would
  // before reaching for the menu.
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.scrollY);

  // Into a song's edit page through the app's own route, then back out the
  // way the header offers.
  const row = page.locator('li', { hasText: 'E2E Scroll Song 20' }).first();
  await row.getByRole('button', { name: 'Song actions' }).click();
  await page.getByRole('menuitem', { name: /^Edit / }).click();
  await expect(page).toHaveURL(/\/edit$/);

  // The editor has its own Back (it reads "Cancel" when dirty), not the
  // header's "← Back".
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/audio/);
  await page.getByText('E2E Scroll Song 20').first().waitFor();
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
    .toBeGreaterThan(before - 50);
});
