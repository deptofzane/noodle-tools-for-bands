import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import {
  deleteConversation,
  findOrCreateConversation,
} from '../lib/db/conversations';
import { createSetlist, deleteSetlist } from '../lib/db/setlists';
import { createEvent, deleteEvent } from '../lib/db/events';

/**
 * The Practice screen's "Select" picker. Its filters (archived, empty,
 * past) are covered against the database in scripts/tests; this is the
 * screen: the button, the pills, Recent, search, and where a choice goes.
 *
 * Everything it adds is named "Zebra…", so one search finds exactly it.
 */
const seed = readSeed();
const made = { songId: '', setlistId: '', eventId: '' };

test.beforeAll(async () => {
  made.songId = (
    await findOrCreateConversation(
      seed.bandId,
      'e2e-zebra',
      'Zebra Picker Song',
    )
  ).id;
  made.setlistId = (
    await createSetlist({
      bandId: seed.bandId,
      createdBy: seed.userId,
      name: 'Zebra Picker Set',
      items: [{ conversationId: made.songId, label: null }],
    })
  ).id;
  made.eventId = (
    await createEvent({
      bandId: seed.bandId,
      title: 'Zebra Picker Gig',
      eventType: 'Show',
      date: '2099-06-01',
      endDate: null,
      time: '20:00',
      endTime: null,
      location: null,
      details: null,
      notes: null,
      setlistId: made.setlistId,
      venueId: null,
      createdBy: seed.userId,
    })
  ).id;
});

test.afterAll(async () => {
  if (made.eventId) await deleteEvent(made.eventId);
  if (made.setlistId) await deleteSetlist(made.setlistId);
  if (made.songId) await deleteConversation(made.songId);
});

const dialog = (p: Page) => p.getByRole('dialog', { name: 'Select' });
const tab = (p: Page, name: string) =>
  dialog(p).getByRole('tab', { name, exact: true });
const search = (p: Page) =>
  dialog(p).getByRole('searchbox', {
    name: 'Search songs, setlists and events',
  });

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  // Past the loading spinner.
  await expect(dialog(page).locator('[role="tabpanel"] svg')).toHaveCount(0);
}

test('Select sits left of Live in the header', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  const select = await page
    .getByRole('button', { name: 'Select', exact: true })
    .boundingBox();
  const live = await page
    .getByRole('link', { name: 'Live', exact: true })
    .boundingBox();
  expect(select!.x + select!.width).toBeLessThanOrEqual(live!.x);
});

test('Recent opens first, listing this song as current', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);
  await expect(tab(page, 'Recent')).toHaveAttribute('aria-selected', 'true');
  const current = dialog(page).locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('Song');
  await expect(current).toContainText('Current');
});

test('each pill lists its kind, and the choice is remembered', async ({
  page,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);

  await tab(page, 'Songs').click();
  await expect(dialog(page).getByText('Zebra Picker Song')).toBeVisible();
  await tab(page, 'Setlists').click();
  await expect(dialog(page).getByText('Zebra Picker Set')).toBeVisible();
  await expect(
    dialog(page).getByRole('link', { name: /Zebra Picker Set/ }),
  ).toContainText('1 song');
  await tab(page, 'Events').click();
  await expect(dialog(page).getByText('Zebra Picker Gig')).toBeVisible();
  await expect(dialog(page).getByText(/Jun 1, 2099 · 8:00 PM/)).toBeVisible();

  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await openPicker(page);
  await expect(tab(page, 'Events')).toHaveAttribute('aria-selected', 'true');
});

test('search finds songs, setlists and events at once', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);
  await search(page).fill('zebra picker');

  for (const name of ['Songs', 'Setlists', 'Events']) {
    await expect(dialog(page).getByRole('heading', { name })).toBeVisible();
    // No pill is selected while the results span all of them.
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'false');
  }
  await expect(dialog(page).getByText('Zebra Picker Song')).toBeVisible();
  await expect(dialog(page).getByText('Zebra Picker Gig')).toBeVisible();

  await search(page).fill('nothing is called this');
  await expect(dialog(page).getByText(/Nothing matches/)).toBeVisible();
});

test('choosing a song goes there, and Back returns', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);
  await search(page).fill('zebra picker song');
  await dialog(page)
    .getByRole('link', { name: /Zebra Picker Song/ })
    .click();

  await expect(page).toHaveURL(new RegExp(`/notes/${made.songId}/practice$`));
  await expect(dialog(page)).toHaveCount(0);

  await page.getByRole('button', { name: /Back/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/notes/${seed.songId}/practice$`));
});

test('an event opens its setlist, and is what Recent remembers', async ({
  page,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);
  await search(page).fill('zebra picker gig');
  await dialog(page)
    .getByRole('link', { name: /Zebra Picker Gig/ })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/practice\\?setlist=${made.setlistId}.*event=${made.eventId}`),
  );
  await openPicker(page);
  await tab(page, 'Recent').click();
  const current = dialog(page).locator('[aria-current="page"]');
  await expect(current).toContainText('Zebra Picker Gig');
  await expect(current).toContainText('Event');
  // Recorded as the event, not also as its setlist.
  await expect(
    dialog(page).getByText('Zebra Picker Set', { exact: true }),
  ).toHaveCount(0);
});

test('choosing the current item just closes', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);
  await tab(page, 'Recent').click();
  await dialog(page).locator('[aria-current="page"]').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/notes/${seed.songId}/practice$`));
});

test('offline, the picker says so rather than showing an empty list', async ({
  page,
  context,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await context.setOffline(true);
  // A real tap: the offline banner must not sit over the header.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(
    dialog(page).getByText('You’re offline — the list needs a connection.'),
  ).toBeVisible();
  await context.setOffline(false);
});

test('on a phone the picker fills the screen', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await openPicker(page);
  const card = (await dialog(page).locator('> div').boundingBox())!;
  const view = page.viewportSize()!;
  expect(card.width).toBeCloseTo(view.width, 0);
  expect(card.height).toBeCloseTo(view.height, 0);
  // No keyboard popping up over the list on open.
  await expect(search(page)).not.toBeFocused();
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false });

  test('a centred dialog, with the search ready to type in', async ({
    page,
  }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    await openPicker(page);
    const card = (await dialog(page).locator('> div').boundingBox())!;
    expect(card.width).toBeLessThan(600);
    await expect(search(page)).toBeFocused();
  });
});

test.describe('Home', () => {
  const homeTab = (p: Page, name: string) =>
    p
      .getByRole('tablist', { name: 'Home' })
      .getByRole('tab', { name, exact: true });

  test('the Practice pill opens the picker and leaves the open tab alone', async ({
    page,
  }) => {
    await page.goto('/home');
    await homeTab(page, 'Activity').click();
    await homeTab(page, 'Practice').click();

    await expect(dialog(page)).toBeVisible();
    // Home shows no song, setlist or event, so nothing is current.
    await expect(dialog(page).locator('[aria-current="page"]')).toHaveCount(0);

    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(homeTab(page, 'Activity')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(homeTab(page, 'Practice')).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // Not remembered as the tab either.
    await page.reload();
    await expect(homeTab(page, 'Activity')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('choosing from it goes to Practice, and Back returns Home', async ({
    page,
  }) => {
    await page.goto('/home');
    await homeTab(page, 'Practice').click();
    await search(page).fill('zebra picker song');
    await dialog(page)
      .getByRole('link', { name: /Zebra Picker Song/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/notes/${made.songId}/practice$`));

    await page.getByRole('button', { name: /Back/ }).first().click();
    await expect(page).toHaveURL(/\/home$/);
  });
});
