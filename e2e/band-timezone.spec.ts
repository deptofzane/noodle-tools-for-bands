import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';

/**
 * The band's timezone decides when its event reminders fire, so a wrong value
 * is silent — nothing errors, the reminders just arrive at the wrong hour.
 * These cover the two ways it gets set and the rejection of a zone that isn't.
 */
const seed = readSeed();

test('the quick-set button stores this device’s zone', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/edit`);
  const select = page.getByRole('combobox', { name: 'Band timezone' });
  await expect(select).toBeVisible();

  const quick = page.getByRole('button', { name: /^Use / });
  const zone = (await quick.textContent())!.replace('Use ', '').trim();
  await quick.click();
  await expect(select).toContainText(zone);

  // Stored, not just shown.
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Band timezone' }),
  ).toContainText(zone);
  // Already this zone, so the button has nothing left to offer.
  await expect(page.getByRole('button', { name: /^Use / })).toHaveCount(0);
});

test('an unknown zone is refused by the API', async ({ request }) => {
  const res = await request.patch(`/api/bands/${seed.bandId}`, {
    data: { timezone: 'Mars/Olympus_Mons' },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe('bad_timezone');
});
