import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { createVenue, listBandVenues } from '../lib/db/venues';

const seed = readSeed();
const VENUE_A = 'E2E Venue Alpha';
const VENUE_B = 'E2E Venue Beta';

/** Two venues, so "picked the wrong one" is something the test can do. */
test.beforeAll(async () => {
  const existing = await listBandVenues(seed.bandId);
  for (const name of [VENUE_A, VENUE_B]) {
    if (existing.some((v) => v.name === name)) continue;
    await createVenue({
      bandId: seed.bandId,
      createdBy: seed.userId,
      fields: {
        name,
        address: `${name} Street`,
        phone: null,
        email: null,
        contactName: null,
        notes: null,
      },
    });
  }
});

const openPicker = async (page: import('@playwright/test').Page) => {
  await page.goto('/calendar/events/new');
  await page.getByRole('button', { name: 'Choose a saved venue…' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a venue' }),
  ).toBeVisible();
};

test('choosing a venue marks it but does not close the modal', async ({
  page,
}) => {
  await openPicker(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(VENUE_A) }).click();

  // Still open, and the row is marked rather than committed.
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: new RegExp(VENUE_A) }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Save commits the choice, and a wrong tap can be corrected first', async ({
  page,
}) => {
  await openPicker(page);
  const dialog = page.getByRole('dialog');

  // The wrong one first — the case a click-to-commit picker made expensive.
  await dialog.getByRole('button', { name: new RegExp(VENUE_A) }).click();
  await dialog.getByRole('button', { name: new RegExp(VENUE_B) }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: VENUE_B })).toBeVisible();
});

test('Cancel leaves the event’s venue alone', async ({ page }) => {
  await openPicker(page);
  const dialog = page.getByRole('dialog');

  await dialog.getByRole('button', { name: new RegExp(VENUE_A) }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Choose a saved venue…' }),
  ).toBeVisible();
});
