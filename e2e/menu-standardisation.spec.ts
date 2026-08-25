import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { readSeed, E2E } from './fixtures';
import { createAlbum } from '../lib/db/albums';
import { createTodo } from '../lib/db/todos';
import { createEvent } from '../lib/db/events';

/**
 * The four detail-page menus now lead with an icon row instead of worded
 * "Edit …"/"Share …" items. This checks the three things that conversion can
 * silently get wrong: the row's position among the menu's items, that the old
 * worded items are actually gone rather than duplicated, and that each glyph
 * still does what its accessible name claims.
 */
const seed = readSeed();
let albumId = '';
let todoId = '';
let eventId = '';
const TODO_TITLE = 'E2E Todo For Menus';

test.beforeAll(async () => {
  albumId = await createAlbum(seed.bandId, seed.userId, 'E2E Album', [
    { conversationId: seed.songId, audioVersionId: null },
  ]);
  const todo = await createTodo({
    bandId: seed.bandId,
    creatorId: seed.userId,
    title: TODO_TITLE,
    description: null,
    shared: false,
    ownerId: null,
    deadline: null,
    links: [],
  });
  todoId = todo.id;

  const event = await createEvent({
    bandId: seed.bandId,
    title: 'E2E Menu Gig',
    eventType: null,
    date: '2030-01-01',
    endDate: null,
    time: null,
    endTime: null,
    location: null,
    details: null,
    notes: null,
    setlistId: seed.setlistId,
    venueId: null,
    createdBy: seed.userId,
  });
  eventId = event.id;
});

/** Accessible names of the menu's children, in DOM order. */
async function menuItemNames(page: Page): Promise<string[]> {
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu
    .getByRole('menuitem')
    .evaluateAll((els) =>
      els.map(
        (el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
      ),
    );
}

async function openMenu(page: Page, name: string): Promise<string[]> {
  await page.getByRole('button', { name, exact: true }).click();
  return menuItemNames(page);
}

test.describe('detail-page action menus', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('album: icon row sits after the play row, worded items gone', async ({
    page,
  }) => {
    await page.goto(`/bands/${seed.bandId}/albums/${albumId}`);
    const names = await openMenu(page, 'Album actions');

    // Play/Shuffle/Queue first, then the icon row, then Delete.
    expect(names.slice(0, 3)).toEqual([
      'Play all songs in E2E Album',
      'Shuffle all songs in E2E Album',
      'Add songs in E2E Album to the queue',
    ]);
    expect(names[3]).toBe('Edit E2E Album');
    expect(names[4]).toBe('Copy a link to E2E Album');
    expect(names).not.toContain('Edit album');

    await page
      .getByRole('menuitem', { name: 'Copy a link to E2E Album' })
      .click();
    await expect(page.getByText('Album link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/bands/${seed.bandId}/albums/${albumId}`,
    );

    await openMenu(page, 'Album actions');
    await page.getByRole('menuitem', { name: 'Edit E2E Album' }).click();
    await expect(page).toHaveURL(
      `/bands/${seed.bandId}/albums/${albumId}/edit`,
    );
  });

  test('song: icon row is first, worded item gone', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}`);
    const names = await openMenu(page, 'Song actions');

    expect(names[0]).toBe('Edit this song');
    expect(names[1]).toBe('Copy a link to this song');
    expect(names).not.toContain('Edit song');

    await page
      .getByRole('menuitem', { name: 'Copy a link to this song' })
      .click();
    await expect(page.getByText('Song link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/notes/${seed.songId}`,
    );

    await openMenu(page, 'Song actions');
    await page.getByRole('menuitem', { name: 'Edit this song' }).click();
    await expect(page).toHaveURL(`/notes/${seed.songId}/edit`);
  });

  test('setlist: icon row sits after the play row, worded item gone', async ({
    page,
  }) => {
    await page.goto(`/bands/${seed.bandId}/setlists/${seed.setlistId}`);
    const names = await openMenu(page, 'Setlist actions');

    const set = E2E.setlistName;
    expect(names.slice(0, 3)).toEqual([
      `Play all songs in ${set}`,
      `Shuffle all songs in ${set}`,
      `Add songs in ${set} to the queue`,
    ]);
    expect(names[3]).toBe(`Edit ${set}`);
    expect(names[4]).toBe(`Copy a link to ${set}`);
    expect(names).not.toContain('Edit setlist');

    await page.getByRole('menuitem', { name: `Copy a link to ${set}` }).click();
    await expect(page.getByText('Setlist link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/bands/${seed.bandId}/setlists/${seed.setlistId}`,
    );
  });

  test('todo: three-icon row is first, worded items gone', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}?tab=todos`);
    // The list opens on "All", which means everything the band has *shared*.
    // The seeded todo is personal, so it only appears under "Mine".
    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    const names = await openMenu(page, `Actions for ${TODO_TITLE}`);

    expect(names[0]).toBe(`View ${TODO_TITLE}`);
    expect(names[1]).toBe(`Edit ${TODO_TITLE}`);
    expect(names[2]).toBe(`Copy a link to ${TODO_TITLE}`);
    expect(names).not.toContain('View todo');
    expect(names).not.toContain('Edit todo');

    await page
      .getByRole('menuitem', { name: `Copy a link to ${TODO_TITLE}` })
      .click();
    await expect(page.getByText('Todo link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/bands/${seed.bandId}/todos/${todoId}`,
    );

    await openMenu(page, `Actions for ${TODO_TITLE}`);
    await page.getByRole('menuitem', { name: `View ${TODO_TITLE}` }).click();
    await expect(page).toHaveURL(`/bands/${seed.bandId}/todos/${todoId}`);
  });
});

/**
 * The six per-song menus. Same conversion, but five of them are *gaining*
 * Share rather than restyling one they already had, so the clipboard
 * assertions are the point rather than a formality.
 */
test.describe('per-song action menus', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  const SONG = E2E.songName;
  const songUrl = (page: Page) =>
    `${new URL(page.url()).origin}/notes/${seed.songId}`;

  /** Row first, in the documented order, with no worded leftovers. */
  async function expectSongRow(names: string[], at: number) {
    expect(names[at]).toBe(`View ${SONG}`);
    expect(names[at + 1]).toBe(`Edit ${SONG}`);
    expect(names[at + 2]).toBe(`Copy a link to ${SONG}`);
    expect(names).not.toContain('View song');
    expect(names).not.toContain('Edit song');
    expect(names).not.toContain('Share song');
  }

  test('setlist page: the menu is just the row', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/setlists/${seed.setlistId}`);
    const names = await openMenu(page, 'Song actions');
    expect(names).toHaveLength(3);
    await expectSongRow(names, 0);

    await page
      .getByRole('menuitem', { name: `Copy a link to ${SONG}` })
      .click();
    await expect(page.getByText('Song link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      songUrl(page),
    );
  });

  test('album page: the row sits under the repair item', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/albums/${albumId}`);
    const names = await openMenu(page, `Actions for ${SONG}`);
    // Healthy track, so "Use the current version" is absent and the row is
    // first anyway; position 0 is what a non-broken row must show.
    await expectSongRow(names, 0);

    await page.getByRole('menuitem', { name: `Edit ${SONG}` }).click();
    await expect(page).toHaveURL(`/notes/${seed.songId}/edit`);
  });

  test('event page: the row precedes Remove', async ({ page }) => {
    await page.goto(`/calendar/events/${eventId}`);
    const names = await openMenu(page, 'Song actions');
    await expectSongRow(names, 0);
    expect(names[3]).toContain('Remove song from setlist');
  });

  test('audio list: the worded trio is gone', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
    const names = await openMenu(page, 'Song actions');
    await expectSongRow(names, 0);
    // Single-song row: no Play/Shuffle to fold a queue icon into, so the
    // worded queue item stays.
    expect(names).toContain('Add song to queue');

    await page
      .getByRole('menuitem', { name: `Copy a link to ${SONG}` })
      .click();
    await expect(page.getByText('Song link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      songUrl(page),
    );
  });

  test('queue: row first, other items kept', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
    await page.getByRole('button', { name: 'Song actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Add song to queue' }).click();
    await page.getByRole('tab', { name: 'Song queue', exact: true }).click();

    const names = await openMenu(page, `Actions for ${SONG}`);
    await expectSongRow(names, 0);
    expect(names.slice(3)).toEqual([
      'Practice',
      'Remove from queue',
      'Add to setlist',
    ]);
  });

  test('full player: View keeps ?from=, Share drops it', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
    await page.getByRole('button', { name: 'Song actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Add song to queue' }).click();
    await page.getByRole('button', { name: 'Expand player' }).click();

    const names = await openMenu(page, `Actions for ${SONG}`);
    await expectSongRow(names, 0);

    // Share must copy the plain song URL, not the queue track's `?from=`
    // href — a back-link means nothing to whoever receives it.
    await page
      .getByRole('menuitem', { name: `Copy a link to ${SONG}` })
      .click();
    await expect(page.getByText('Song link copied.')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(songUrl(page));
    expect(copied).not.toContain('?from=');

    // View, by contrast, keeps it. The player is still expanded — copying a
    // link doesn't navigate — so the menu is reopened in place.
    await openMenu(page, `Actions for ${SONG}`);
    await page.getByRole('menuitem', { name: `View ${SONG}` }).click();
    await expect(page).toHaveURL(/\/notes\/[^?]+\?from=audio/);
  });
});
