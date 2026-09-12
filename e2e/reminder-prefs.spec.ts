import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { getReminderPrefs } from '../lib/db/event-reminders';
import { prefKey } from '../lib/reminder-prefs';
import { readSeed } from './fixtures';

/**
 * Settings › Notifications › Event reminders.
 *
 * The grid is the only way anyone sees what the sweep will do, and it stores
 * *disagreements* rather than choices — so the two things worth proving are
 * that an untouched box shows its default, and that both directions of a
 * toggle survive a reload. A one-way test would pass against a version that
 * could never turn a default-on reminder back on.
 */

const group = (p: Page, offset: string) =>
  p.getByRole('group', { name: `Remind me ${offset}` });

const box = (p: Page, offset: string, category: string) =>
  group(p, offset).getByRole('checkbox', { name: category });

async function openReminders(p: Page) {
  await p.goto('/settings?tab=notifications');
  await expect(group(p, 'the day of')).toBeVisible();
}

test('untouched boxes show the defaults', async ({ page }) => {
  await openReminders(page);

  // Shows get all three — the one you can't afford to miss.
  await expect(box(page, 'a week before', 'Shows')).toBeChecked();
  await expect(box(page, 'the day before', 'Shows')).toBeChecked();
  await expect(box(page, 'the day of', 'Shows')).toBeChecked();

  // Practice gets only the morning-of nudge.
  await expect(box(page, 'a week before', 'Practice')).not.toBeChecked();
  await expect(box(page, 'the day of', 'Practice')).toBeChecked();

  // Time off is on the calendar so nobody books over it, not to be announced.
  await expect(box(page, 'the day of', 'Time off')).not.toBeChecked();
});

test('turning a default-on reminder off sticks, and back on again', async ({
  page,
}) => {
  await openReminders(page);
  const weekShows = box(page, 'a week before', 'Shows');

  const stored = () => getReminderPrefs(readSeed().userId);
  const key = prefKey('show', 'event-week-before');

  await weekShows.uncheck();
  await page.reload();
  await expect(box(page, 'a week before', 'Shows')).not.toBeChecked();
  // The disagreement is written down.
  expect((await stored()).get(key)).toBe(false);

  // Back to the default. This path deletes the stored row rather than pinning
  // it, so it has to round-trip as well as the disagreement did...
  await box(page, 'a week before', 'Shows').check();
  await page.reload();
  await expect(box(page, 'a week before', 'Shows')).toBeChecked();
  // ...and leave no row behind. Storing an explicit `true` here would look
  // identical on screen while quietly opting this user out of any later change
  // to what the default is.
  expect((await stored()).has(key)).toBe(false);
});

test('turning a default-off reminder on sticks', async ({ page }) => {
  await openReminders(page);

  await box(page, 'the day of', 'Time off').check();
  await page.reload();
  await expect(box(page, 'the day of', 'Time off')).toBeChecked();

  // Restore, so this spec leaves the shared e2e user as it found them.
  await box(page, 'the day of', 'Time off').uncheck();
  await page.reload();
  await expect(box(page, 'the day of', 'Time off')).not.toBeChecked();
});
