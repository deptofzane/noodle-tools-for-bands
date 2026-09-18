import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { E2E, readSeed } from './fixtures';
import { db } from '../lib/db';
import { conversations } from '../lib/db/schema';
import {
  deleteConversation,
  findOrCreateConversation,
} from '../lib/db/conversations';

/**
 * The Audio page's Songs view.
 *
 * The list used to sit in a collapsible container beside an Archived one; the
 * archived list moved to History, so the songs are the page itself now.
 *
 * As in the archived spec, the three fixtures have name order and upload order
 * disagreeing as *sequences* — Bravo is newest but sorts second — because two
 * rows whose orders happen to match let a comparator that ignores the chosen
 * key pass every assertion.
 */
const seed = readSeed();
/** Sorts 1st by name, 2nd by date. */
const ALPHA = 'E2E Song Alpha';
/** Sorts 2nd by name, newest by date. */
const BRAVO = 'E2E Song Bravo';
/** Sorts 3rd by name, oldest by date. */
const ZEBRA = 'E2E Song Zebra';
/** Narrows the list to exactly these three, so "first row" means something. */
const ONLY_OURS = 'E2E Song';
const ids: string[] = [];

async function song(name: string, driveId: string, createdAt: Date) {
  const c = await findOrCreateConversation(seed.bandId, driveId, name);
  await db
    .update(conversations)
    .set({ createdAt, archived: false })
    .where(eq(conversations.id, c.id));
  ids.push(c.id);
}

test.beforeAll(async () => {
  await song(ALPHA, 'e2e-song-alpha', new Date('2022-01-01T00:00:00Z'));
  await song(BRAVO, 'e2e-song-bravo', new Date('2024-06-01T00:00:00Z'));
  await song(ZEBRA, 'e2e-song-zebra', new Date('2020-01-01T00:00:00Z'));
});

test.afterAll(async () => {
  for (const id of ids) await deleteConversation(id);
});

/** Open Songs, narrowed to this spec's three fixtures. */
async function songs(page: Page) {
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  const list = page.getByRole('list', { name: 'Songs' });
  await expect(list).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search audio' }).fill(ONLY_OURS);
  await expect(list.getByRole('listitem')).toHaveCount(3);
  return list;
}

test('the songs are the page, with no container to collapse', async ({
  page,
}) => {
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);

  // Visible without expanding anything, under a heading of its own.
  await expect(page.getByRole('heading', { name: 'Songs' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Songs' })).toBeVisible();

  // And the collapse control is gone — it rendered as "Minimize Audio".
  await expect(
    page.getByRole('button', { name: /^(Minimize|Expand) (Audio|Albums)$/ }),
  ).toHaveCount(0);
});

test('a song with sheet music gets an icon beside Play', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  const list = page.getByRole('list', { name: 'Songs' });
  await expect(list).toBeVisible();

  // The seeded song has a chart; it leads to the same page its name does.
  const withChart = list
    .getByRole('listitem')
    .filter({ hasText: E2E.songName });
  const icon = withChart.getByRole('link', { name: /has sheet music/ });
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute(
    'href',
    `/notes/${seed.songId}/practice?from=audio`,
  );

  // This spec's fixtures have no chart, so they get none — without this the
  // test would pass against an icon rendered on every row.
  await expect(
    list
      .getByRole('listitem')
      .filter({ hasText: ALPHA })
      .getByRole('link', { name: /has sheet music/ }),
  ).toHaveCount(0);
});

test('the default order is newest upload first', async ({ page }) => {
  const list = await songs(page);
  // Bravo leads on date but sorts second by name, so this says the default
  // really is date rather than alphabetical order wearing a hat.
  await expect(list.getByRole('listitem').first()).toContainText(BRAVO);
});

test('sorting by name reorders, and flips on a second press', async ({
  page,
}) => {
  const list = await songs(page);

  // Alpha only leads under name-ascending: by date it's in the middle.
  await page.getByRole('button', { name: 'Name' }).click();
  await expect(list.getByRole('listitem').first()).toContainText(ALPHA);

  await page.getByRole('button', { name: 'Name' }).click();
  await expect(list.getByRole('listitem').first()).toContainText(ZEBRA);
});

test('sorting by date can be flipped to oldest first', async ({ page }) => {
  const list = await songs(page);

  // Already the active column, so one press reverses it rather than
  // re-selecting it.
  await page.getByRole('button', { name: 'Date uploaded' }).click();
  await expect(list.getByRole('listitem').first()).toContainText(ZEBRA);
});
