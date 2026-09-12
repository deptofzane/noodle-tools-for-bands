import '../scripts/load-env';
import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { createBand, deleteBand } from '../lib/db/bands';
import { createEvent, deleteEvent } from '../lib/db/events';

/**
 * Home's Activity tab carries the month calendar, across every band.
 *
 * The Calendar page shows one band; this is the cross-band view, so the test
 * that matters is that a second band's events are on it — and that the band
 * picker above still governs it, rather than the calendar quietly ignoring the
 * one control the tab has.
 *
 * Runs at the default phone viewport, which is where the seven columns are
 * tightest.
 */
const seed = readSeed();
const OTHER_BAND = 'E2E Home Cal Band';
let otherBandId = '';
/** Events made in the seeded band, which nothing else tears down. */
const mineEventIds: string[] = [];

/** The 15th of a month `offset` months from now — always inside that grid. */
const mid = (offset: number) => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 15);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-15`;
};

const event = (bandId: string, title: string, monthOffset = 0) =>
  createEvent({
    bandId,
    title,
    eventType: 'Show',
    date: mid(monthOffset),
    endDate: null,
    time: '20:00',
    endTime: '21:00',
    location: null,
    details: null,
    notes: null,
    setlistId: null,
    venueId: null,
    createdBy: seed.userId,
  });

test.beforeAll(async () => {
  otherBandId = (await createBand(seed.userId, OTHER_BAND)).id;
  mineEventIds.push((await event(seed.bandId, 'E2E Home Cal Mine')).id);
  // Next month, so paging to it has something only a fresh fetch can show.
  mineEventIds.push((await event(seed.bandId, 'E2E Home Cal Next', 1)).id);
  await event(otherBandId, 'E2E Home Cal Other');
});

test.afterAll(async () => {
  // The seeded band's events are ours to remove; the other band takes its own.
  for (const id of mineEventIds) await deleteEvent(id);
  await deleteBand(otherBandId);
});

/** Open Home on the Activity tab. */
async function activity(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');
  return page.getByRole('region', { name: 'Calendar' });
}

test('the month calendar spans every band the user is in', async ({ page }) => {
  const calendar = await activity(page);
  await expect(calendar).toBeVisible();

  // Both bands, with no picking required — this is the cross-band surface.
  await expect(calendar.getByText('E2E Home Cal Mine')).toBeVisible();
  await expect(calendar.getByText('E2E Home Cal Other')).toBeVisible();
});

test('the band picker narrows the calendar with the rest of the tab', async ({
  page,
}) => {
  const calendar = await activity(page);
  await expect(calendar.getByText('E2E Home Cal Mine')).toBeVisible();

  await page.getByRole('combobox', { name: 'Band' }).click();
  await page.getByRole('option', { name: OTHER_BAND }).click();

  await expect(calendar.getByText('E2E Home Cal Other')).toBeVisible();
  await expect(calendar.getByText('E2E Home Cal Mine')).toHaveCount(0);
});

test('paging to another month fetches it', async ({ page }) => {
  const calendar = await activity(page);
  await expect(calendar.getByText('E2E Home Cal Mine')).toBeVisible();

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextLabel = next.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  await calendar.getByRole('button', { name: 'Next month' }).click();

  await expect(calendar.getByRole('heading', { name: nextLabel })).toBeVisible();
  await expect(calendar.getByText('E2E Home Cal Mine')).toHaveCount(0);
  // Next month's event is the real proof: it was never in the first response,
  // so it can only be here if paging actually refetched.
  await expect(calendar.getByText('E2E Home Cal Next')).toBeVisible();
});
