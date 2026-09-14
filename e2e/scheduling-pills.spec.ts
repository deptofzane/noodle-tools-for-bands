import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { createEvent, deleteEvent } from '../lib/db/events';
import { upsertUser } from '../lib/db/users';
import { deleteUsersByGoogleSub } from '../lib/db/accounts';
import { createBand, deleteBand } from '../lib/db/bands';
import { createVenue } from '../lib/db/venues';

/**
 * Scheduling's three pills: the month calendar, the current band's events, and
 * its venues.
 *
 * The pills carry their view in the URL rather than only in memory, because
 * the ☰ drawer links straight to Events and Venues — so the deep-link test
 * below is the one that keeps those entries honest.
 */
const seed = readSeed();
let eventId = '';
/** A band the seeded user is *not* in, for the venue-page guard below. */
const STRANGER_SUB = 'e2e-sched-stranger';
let strangerBandId = '';
let strangerVenueId = '';

/** The 15th of the month on screen — inside the grid whatever today is. */
const midMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
};

test.beforeAll(async () => {
  eventId = (
    await createEvent({
      bandId: seed.bandId,
      title: 'E2E Sched Event',
      eventType: 'Show',
      date: midMonth(),
      endDate: null,
      time: '20:00',
      endTime: '21:00',
      location: null,
      details: null,
      notes: null,
      setlistId: null,
      venueId: null,
      createdBy: seed.userId,
    })
  ).id;

  const stranger = await upsertUser({
    googleSub: STRANGER_SUB,
    email: 'e2e-sched-stranger@noodle.test',
    name: 'Sched Stranger',
  });
  strangerBandId = (await createBand(stranger.id, 'E2E Sched Stranger Band')).id;
  strangerVenueId = (
    await createVenue({
      bandId: strangerBandId,
      createdBy: stranger.id,
      fields: {
        name: 'E2E Stranger Venue',
        address: '',
        phone: '',
        email: '',
        contactName: '',
        notes: '',
      },
    })
  ).id;
});

test.afterAll(async () => {
  await deleteEvent(eventId);
  await deleteBand(strangerBandId);
  await deleteUsersByGoogleSub([STRANGER_SUB]);
});

/** Open Scheduling with the seeded band as the app's current band. */
async function scheduling(page: Page, view = '') {
  await page.addInitScript(
    (id) => localStorage.setItem('selectedBandId', id),
    seed.bandId,
  );
  await page.goto(`/scheduling${view}`);
  return page.getByRole('tablist', { name: 'Scheduling' });
}

test('three pills, in order, opening on Calendar', async ({ page }) => {
  const pills = await scheduling(page);

  await expect(pills.getByRole('tab')).toHaveText([
    'Calendar',
    'Events',
    'Venues',
  ]);
  await expect(pills.getByRole('tab', { name: 'Calendar' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('Events shows the band’s events and names itself in the URL', async ({
  page,
}) => {
  const pills = await scheduling(page);
  await pills.getByRole('tab', { name: 'Events' }).click();

  await expect(page.getByText('E2E Sched Event').first()).toBeVisible();
  await expect(page).toHaveURL(/\/scheduling\?view=events$/);
});

test('a Venues deep link opens on Venues', async ({ page }) => {
  const pills = await scheduling(page, '?view=venues');

  await expect(pills.getByRole('tab', { name: 'Venues' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible();
});

test('going back to Calendar drops the parameter', async ({ page }) => {
  const pills = await scheduling(page, '?view=venues');
  await pills.getByRole('tab', { name: 'Calendar' }).click();

  // Calendar is the default, so it stays paramless — the same rule the band
  // page uses for its own default tab.
  await expect(page).toHaveURL(/\/scheduling$/);
  await expect(
    page.getByRole('button', { name: 'Calendar actions' }),
  ).toBeVisible();
});

/**
 * The venue page's remaining guard.
 *
 * It used to live under `/bands/[bandId]/venues/[venueId]`, where the test was
 * that a real venue id under the *wrong band's* URL 404s. There's no band in
 * the URL any more, so that mismatch can't happen — the venue names its own
 * band. What's left to get wrong is membership: the page must not render a
 * venue belonging to a band you're not in, just because you know its id.
 */
/**
 * The ☰ drawer's Events and Venues links, used from Scheduling itself.
 *
 * The deep-link test above arrives with `page.goto`, which mounts the client
 * fresh — so it passed for months while these links did nothing. Navigating
 * *within* the route is the case that broke: the shell re-rendered, the
 * component didn't remount, and a `useState` copy of the view ignored it.
 *
 * The third case is the one a naive fix still fails: a pill tap rewrites the
 * URL without telling the router, so asking the drawer for a view the router
 * thinks you're already on has to work too.
 */
async function drawerTo(page: Page, name: string) {
  await page.getByRole('button', { name: /^Menu/ }).click();
  await expect(page.locator('#app-nav-menu')).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole('menuitem', { name, exact: true }).click();
}

const selected = (page: Page, name: string) =>
  expect(
    page
      .getByRole('tablist', { name: 'Scheduling' })
      .getByRole('tab', { name }),
  ).toHaveAttribute('aria-selected', 'true');

test('the drawer switches view while already on Scheduling', async ({
  page,
}) => {
  await scheduling(page);
  await drawerTo(page, 'Events');
  await selected(page, 'Events');
  await expect(page).toHaveURL(/\/scheduling\?view=events$/);

  await drawerTo(page, 'Venues');
  await selected(page, 'Venues');
});

test('the drawer still works after a pill tap has rewritten the URL', async ({
  page,
}) => {
  await scheduling(page, '?view=events');
  // Back to Calendar, which drops the parameter.
  await page
    .getByRole('tablist', { name: 'Scheduling' })
    .getByRole('tab', { name: 'Calendar' })
    .click();
  await expect(page).toHaveURL(/\/scheduling$/);

  await drawerTo(page, 'Events');
  await selected(page, 'Events');
});

test('a venue in a band you’re not in is not found', async ({ page }) => {
  const res = await page.goto(`/scheduling/venues/${strangerVenueId}`);
  expect(res?.status()).toBe(404);
});

/**
 * The old `/calendar` paths still resolve.
 *
 * Bookmarks are the least of it: the iCalendar feed wrote absolute
 * `…/calendar/events/<id>` links into calendars people have already
 * subscribed, and delivered push notifications carry their URL in the payload.
 * Neither can be rewritten after the fact, so this redirect is the only thing
 * keeping them alive.
 */
test('old calendar links redirect to scheduling', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/scheduling$/);

  await page.goto(`/calendar/events/${eventId}`);
  await expect(page).toHaveURL(`/scheduling/events/${eventId}`);
});
