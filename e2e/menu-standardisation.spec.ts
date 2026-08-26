import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { readSeed, E2E } from './fixtures';
import { createAlbum, listAlbums } from '../lib/db/albums';
import { createTodo, listTodos } from '../lib/db/todos';
import { createEvent, listBandEvents } from '../lib/db/events';
import { createVenue, listBandVenues } from '../lib/db/venues';
import { createBand } from '../lib/db/bands';
import { createNote, listBandNotesForUser } from '../lib/db/user-notes';

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
let venueId = '';
let noteId = '';
const TODO_TITLE = 'E2E Todo For Menus';
const VENUE = 'E2E Menu Venue';
const NOTE = 'E2E Menu Note';

const ALBUM = 'E2E Album';
const GIG = 'E2E Menu Gig';

/**
 * Fixtures, found before they're created.
 *
 * Playwright restarts its worker after a failed test, and a restart re-runs
 * this hook for whatever is left in the file. With plain `create*` calls that
 * turned one real failure into several bogus ones: a second venue and a third
 * note meant `getByRole` matched more than one element, and strict mode
 * rejected the lot. Reusing what's already there makes the hook safe to run
 * any number of times — the same property `findOrCreateConversation` gives the
 * seed, for the same reason.
 */
test.beforeAll(async () => {
  const album = (await listAlbums(seed.bandId)).find((a) => a.name === ALBUM);
  albumId =
    album?.id ??
    (await createAlbum(seed.bandId, seed.userId, ALBUM, [
      { conversationId: seed.songId, audioVersionId: null },
    ]));

  const todo = (
    await listTodos(seed.bandId, seed.userId, {
      scope: 'mine',
      status: 'active',
    })
  ).find((t) => t.title === TODO_TITLE);
  todoId =
    todo?.id ??
    (
      await createTodo({
        bandId: seed.bandId,
        creatorId: seed.userId,
        title: TODO_TITLE,
        description: null,
        shared: false,
        ownerId: null,
        deadline: null,
        links: [],
      })
    ).id;

  const event = (await listBandEvents(seed.bandId)).find(
    (e) => e.title === GIG,
  );
  eventId =
    event?.id ??
    (
      await createEvent({
        bandId: seed.bandId,
        title: GIG,
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
      })
    ).id;

  const venue = (await listBandVenues(seed.bandId)).find(
    (v) => v.name === VENUE,
  );
  venueId =
    venue?.id ??
    (
      await createVenue({
        bandId: seed.bandId,
        createdBy: seed.userId,
        fields: {
          name: VENUE,
          address: '12 Test Street',
          phone: '555-0100',
          email: 'book@e2e.test',
          contactName: 'E2E Booker',
          notes: 'Load in through the back.',
        },
      })
    ).id;

  const note = (await listBandNotesForUser(seed.bandId, seed.userId)).find(
    (n) => n.title === NOTE,
  );
  noteId =
    note?.id ??
    (
      await createNote({
        bandId: seed.bandId,
        authorId: seed.userId,
        title: NOTE,
        body: 'E2E note body',
        shared: true,
        links: [],
      })
    ).id;
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

  test('album: icon row leads, worded items gone', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/albums/${albumId}`);
    const names = await openMenu(page, 'Album actions');

    // The icon row leads, then Play/Shuffle/Queue, then Delete.
    expect(names[0]).toBe('Edit E2E Album');
    expect(names[1]).toBe('Copy a link to E2E Album');
    expect(names.slice(2, 5)).toEqual([
      'Play all songs in E2E Album',
      'Shuffle all songs in E2E Album',
      'Add songs in E2E Album to the queue',
    ]);
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

  test('setlist: icon row leads, worded item gone', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/setlists/${seed.setlistId}`);
    const names = await openMenu(page, 'Setlist actions');

    const set = E2E.setlistName;
    expect(names[0]).toBe(`Edit ${set}`);
    expect(names[1]).toBe(`Copy a link to ${set}`);
    expect(names.slice(2, 5)).toEqual([
      `Play all songs in ${set}`,
      `Shuffle all songs in ${set}`,
      `Add songs in ${set} to the queue`,
    ]);
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
    `${new URL(page.url()).origin}/notes/${seed.songId}/practice`;

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
    // No worded "Practice": the row's View opens the practice screen, which
    // is the song's page now, so a separate item said the same thing twice.
    expect(names.slice(3)).toEqual(['Remove from queue', 'Add to setlist']);
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

/**
 * The remaining menus: two list trios, the overview menu that acts on an event
 * *and* its setlist, and the venue pair — including the View page that had to
 * be built before "View venue" had anywhere to go.
 */
test.describe('remaining action menus', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('venue row: View reaches the new page', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}?tab=venues`);
    const names = await openMenu(page, `Actions for ${VENUE}`);
    expect(names[0]).toBe(`View ${VENUE}`);
    expect(names[1]).toBe(`Edit ${VENUE}`);
    expect(names[2]).toBe(`Copy a link to ${VENUE}`);
    expect(names).not.toContain('Edit venue');
    expect(names[3]).toBe('Delete venue');

    await page.getByRole('menuitem', { name: `View ${VENUE}` }).click();
    await expect(page).toHaveURL(`/bands/${seed.bandId}/venues/${venueId}`);
  });

  test('venue page: renders its details and offers Edit + Share', async ({
    page,
  }) => {
    await page.goto(`/bands/${seed.bandId}/venues/${venueId}`);
    await expect(page.getByRole('heading', { name: VENUE })).toBeVisible();
    await expect(page.getByText('12 Test Street')).toBeVisible();
    await expect(page.getByText('Load in through the back.')).toBeVisible();
    await expect(page.getByRole('link', { name: '555-0100' })).toHaveAttribute(
      'href',
      'tel:555-0100',
    );

    const names = await openMenu(page, `Actions for ${VENUE}`);
    expect(names).toEqual([`Edit ${VENUE}`, `Copy a link to ${VENUE}`]);

    await page
      .getByRole('menuitem', { name: `Copy a link to ${VENUE}` })
      .click();
    await expect(page.getByText('Venue link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/bands/${seed.bandId}/venues/${venueId}`,
    );
  });

  test("venue page 404s for another band's venue id", async ({ page }) => {
    // The guard that matters: a real venue id under the wrong band URL.
    const other = await createBand(seed.userId, 'E2E Other Band');
    const res = await page.goto(`/bands/${other.id}/venues/${venueId}`);
    expect(res?.status()).toBe(404);
  });

  test('note row: owner gets three icons, Delete stays worded', async ({
    page,
  }) => {
    await page.goto(`/bands/${seed.bandId}?tab=notes&notes=shared`);
    const names = await openMenu(page, `Actions for ${NOTE}`);
    expect(names[0]).toBe(`View ${NOTE}`);
    expect(names[1]).toBe(`Edit ${NOTE}`);
    expect(names[2]).toBe(`Copy a link to ${NOTE}`);
    expect(names[3]).toBe('Delete note');
    expect(names).not.toContain('View note');
    expect(names).not.toContain('Share note');
  });

  test('album row: the icon row leads the play row', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
    await page.getByRole('button', { name: 'Albums' }).click();
    const names = await openMenu(page, 'Actions for E2E Album');
    expect(names.slice(0, 3)).toEqual([
      'View E2E Album',
      'Edit E2E Album',
      'Copy a link to E2E Album',
    ]);
    expect(names.slice(3)).toEqual([
      'Play all songs in E2E Album',
      'Shuffle all songs in E2E Album',
      'Add songs in E2E Album to the queue',
    ]);
  });

  test('overview event menu: the row is named and leads', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}?tab=events`);
    const names = await openMenu(page, 'Event actions');

    // The icon row acts on the event; the setlist's own actions are worded
    // items below it. The section label is `role="none"`, so it isn't a
    // menuitem and doesn't appear here — its presence is checked separately.
    expect(names.slice(0, 3)).toEqual([
      'View E2E Menu Gig',
      'Edit E2E Menu Gig',
      'Copy a link to E2E Menu Gig',
    ]);
    expect(names).not.toContain('View the setlist for E2E Menu Gig');
    expect(names[3]).toBe('Add setlist songs to queue');

    await expect(
      page.getByRole('menu').getByText('Event', { exact: true }),
    ).toBeVisible();
  });

  test('event page: setlist menu gained Share', async ({ page }) => {
    await page.goto(`/calendar/events/${eventId}`);
    const names = await openMenu(page, 'Setlist actions');
    const set = E2E.setlistName;
    expect(names.slice(0, 3)).toEqual([
      `View ${set}`,
      `Edit ${set}`,
      `Copy a link to ${set}`,
    ]);
    expect(names.slice(3, 6)).toEqual([
      `Play all songs in ${set}`,
      `Shuffle all songs in ${set}`,
      `Add songs in ${set} to the queue`,
    ]);
    expect(names).not.toContain('View setlist');

    await page.getByRole('menuitem', { name: `Copy a link to ${set}` }).click();
    await expect(page.getByText('Setlist link copied.')).toBeVisible();
  });

  test('event page: its own menu is Edit + Share', async ({ page }) => {
    await page.goto(`/calendar/events/${eventId}`);
    const names = await openMenu(page, 'Event actions');
    expect(names).toEqual(['Edit this event', 'Copy a link to this event']);
    expect(names).not.toContain('Edit event');
  });
});

/**
 * The progress bar for menu navigations.
 *
 * `RouteProgress` starts itself from a capture-phase click listener that looks
 * for an enclosing `<a>`. Menu items are buttons, so they had no bar until
 * they went through `useNavigate`. The navigation is stalled deliberately —
 * locally these commit fast enough that a live bar would be a coin flip.
 */
test.describe('route progress from menus', () => {
  const bar = (page: Page) => page.locator('[data-route-progress]');

  test('a kebab navigation raises the bar', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}?tab=venues`);
    await expect(bar(page)).toHaveAttribute('data-route-progress', 'idle');

    // Hold the venue page's payload so the bar is observable.
    await page.route(`**/venues/${venueId}**`, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await page.getByRole('button', { name: `Actions for ${VENUE}` }).click();
    await page.getByRole('menuitem', { name: `View ${VENUE}` }).click();

    await expect(bar(page)).toHaveAttribute('data-route-progress', 'active');
    await expect(page).toHaveURL(`/bands/${seed.bandId}/venues/${venueId}`);
    // And it clears once the route commits, rather than sitting there.
    await expect(bar(page)).toHaveAttribute('data-route-progress', 'idle');
  });

  test("the audio list's View reaches the bar through its callback", async ({
    page,
  }) => {
    // SongRow doesn't navigate itself — it calls props that BandAudioClient
    // supplies, which is how this one escaped the first sweep.
    await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
    await page.route(`**/notes/${seed.songId}**`, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.getByRole('button', { name: 'Song actions' }).first().click();
    await page.getByRole('menuitem', { name: `View ${E2E.songName}` }).click();
    await expect(bar(page)).toHaveAttribute('data-route-progress', 'active');
  });

  test('the bar still tracks ordinary links', async ({ page }) => {
    await page.goto(`/bands/${seed.bandId}?tab=venues`);
    await page.route('**/venues/new**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.getByRole('link', { name: 'Create venue' }).click();
    await expect(bar(page)).toHaveAttribute('data-route-progress', 'active');
  });
});
