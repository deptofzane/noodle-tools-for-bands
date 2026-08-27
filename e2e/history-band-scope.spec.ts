import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';

const seed = readSeed();

/**
 * History is per-band: it asks the API for the band the header has selected,
 * so the page reads as that band's record rather than a merge of every band
 * the viewer belongs to.
 */
test('History requests only the selected band', async ({ page }) => {
  const scoped: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (url.includes('/api/history') || url.includes('filter=closed'))
      scoped.push(url);
  });

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect
    .poll(() => scoped.length, { message: 'a category loaded' })
    .toBeGreaterThan(0);

  for (const url of scoped) {
    expect(url, 'every history request carries the band').toContain(
      `bandId=${seed.bandId}`,
    );
  }
});

test('every History category stays scoped as you switch tabs', async ({
  page,
}) => {
  await page.goto('/history');

  for (const tab of ['Closed polls', 'Past events']) {
    const request = page.waitForRequest((r) =>
      r.url().includes(`bandId=${seed.bandId}`),
    );
    await page.getByRole('tab', { name: tab }).click();
    await request;
  }
});

test('History is in the ☰ menu', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}`);
  await page.getByRole('button', { name: 'Menu' }).click();

  const history = page.getByRole('menuitem', { name: 'History' });
  await expect(history).toBeVisible();
  await history.click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
});
