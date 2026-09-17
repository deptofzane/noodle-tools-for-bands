import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { readSeed } from './fixtures';
import { db } from '../lib/db';
import { conversations } from '../lib/db/schema';
import {
  deleteConversation,
  findOrCreateConversation,
} from '../lib/db/conversations';

/**
 * History › Archived Audio.
 *
 * Archived songs used to live in a container on the Songs list; this tab is
 * now the only place they appear, which is why it carries Un-archive — without
 * it, archiving would be a one-way door.
 *
 * The three fixtures are arranged so name order and upload order disagree as
 * *sequences* — Bravo is newest but sorts second, Zebra is oldest but sorts
 * last. Two fixtures aren't enough: with only "first alphabetically, oldest"
 * and "last alphabetically, newest", sorting by name and by date give the same
 * answer, and a comparator that ignored the chosen key passed every assertion.
 */
const seed = readSeed();
/** Sorts 1st by name, 2nd by date. */
const ALPHA = 'E2E Arch Alpha';
/** Sorts 2nd by name, newest by date. */
const BRAVO = 'E2E Arch Bravo';
/** Sorts 3rd by name, oldest by date. */
const ZEBRA = 'E2E Arch Zebra';
const RESTORE_NAME = 'E2E Arch Restore';
/** Created by the archiving test itself, so it starts out *not* archived. */
const TOAST_NAME = 'E2E Arch Toast';
const ids: string[] = [];

async function archived(name: string, driveId: string, createdAt: Date) {
  const c = await findOrCreateConversation(seed.bandId, driveId, name);
  await db
    .update(conversations)
    .set({ createdAt, archived: true })
    .where(eq(conversations.id, c.id));
  ids.push(c.id);
  return c.id;
}

test.beforeAll(async () => {
  await archived(ALPHA, 'e2e-arch-alpha', new Date('2022-01-01T00:00:00Z'));
  await archived(BRAVO, 'e2e-arch-bravo', new Date('2024-06-01T00:00:00Z'));
  await archived(ZEBRA, 'e2e-arch-zebra', new Date('2020-01-01T00:00:00Z'));
  await archived(
    RESTORE_NAME,
    'e2e-arch-restore',
    new Date('2021-01-01T00:00:00Z'),
  );
});

test.afterAll(async () => {
  for (const id of ids) await deleteConversation(id);
});

/** Open History on the Archived Audio tab, for the seeded band. */
async function archivedTab(page: Page) {
  await page.addInitScript(
    (id) => localStorage.setItem('selectedBandId', id),
    seed.bandId,
  );
  await page.goto('/history?tab=audio');
  const list = page.getByRole('list', { name: 'Archived audio' });
  await expect(list).toBeVisible();
  return list;
}

test('the tab lists archived songs, newest upload first', async ({ page }) => {
  const list = await archivedTab(page);

  await expect(list.getByText(ALPHA)).toBeVisible();
  await expect(list.getByText(ZEBRA)).toBeVisible();
  // Bravo leads on upload date but sorts second by name, so this says the
  // default really is date — it isn't the alphabetical order wearing a hat.
  await expect(list.getByRole('listitem').first()).toContainText(BRAVO);
});

test('sorting by name reorders, and flips on a second press', async ({
  page,
}) => {
  const list = await archivedTab(page);

  // Alpha only leads under name-ascending: by date it's in the middle.
  await page.getByRole('button', { name: 'Name' }).click();
  await expect(list.getByRole('listitem').first()).toContainText(ALPHA);

  // Pressing the active column again reverses it. Zebra leads by name
  // descending, where by date it would be last.
  await page.getByRole('button', { name: 'Name' }).click();
  await expect(list.getByRole('listitem').first()).toContainText(ZEBRA);
});

test('the search bar narrows the list', async ({ page }) => {
  const list = await archivedTab(page);

  await page
    .getByRole('searchbox', { name: 'Search archived audio' })
    .fill('Zebra');
  await expect(list.getByText(ZEBRA)).toBeVisible();
  await expect(list.getByText(ALPHA)).toHaveCount(0);
});

test('un-archiving puts a song back in Songs', async ({ page }) => {
  const list = await archivedTab(page);
  const row = list.getByRole('listitem').filter({ hasText: RESTORE_NAME });

  await row.getByRole('button', { name: 'Un-archive' }).click();
  await expect(
    page.getByText(`${RESTORE_NAME} is no longer archived`),
  ).toBeVisible();
  await expect(list.getByText(RESTORE_NAME)).toHaveCount(0);

  // And it's back on the Songs list it was archived out of.
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  await expect(page.getByText(RESTORE_NAME).first()).toBeVisible();
});

test('archiving a song names it and says where it went', async ({ page }) => {
  // Its own song: archiving is what this tests, so it can't share a fixture
  // with the ordering tests, which expect exactly three rows.
  const c = await findOrCreateConversation(
    seed.bandId,
    'e2e-arch-toast',
    TOAST_NAME,
  );
  ids.push(c.id);

  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  await page
    .locator('li', { hasText: TOAST_NAME })
    .first()
    .getByRole('button', { name: 'Song actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Archive song' }).click();

  await expect(
    page.getByText(
      `${TOAST_NAME} has been archived and can be viewed on the History page`,
    ),
  ).toBeVisible();
  // It really left the list, rather than only saying so.
  await expect(
    page.locator('li', { hasText: TOAST_NAME }).filter({ visible: true }),
  ).toHaveCount(0);
});

test('the Songs list no longer has an Archived container', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  // Positive control: without it, an empty page would pass the absences below.
  await expect(
    page.getByRole('tablist', { name: 'Audio sections' }),
  ).toBeVisible();

  await expect(page.getByText('Archived Audio')).toHaveCount(0);
  await expect(page.getByText(ALPHA)).toHaveCount(0);
  await expect(page.getByText(ZEBRA)).toHaveCount(0);
});
