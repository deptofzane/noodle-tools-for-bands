import '../scripts/load-env';
import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { upsertUser } from '../lib/db/users';
import { deleteUsersByGoogleSub } from '../lib/db/accounts';
import { createBand, deleteBand } from '../lib/db/bands';
import { addEventMember, createEvent, deleteEvent } from '../lib/db/events';

/**
 * The Calendar page shows one band — the one the app is currently "in".
 *
 * The third event is the one worth having a test for: it lives in a band the
 * viewer isn't a member of and is visible only because they were added to it
 * personally, so it has to survive every band filter. A strict `bandId` match
 * would leave it with nowhere to appear at all.
 */
const seed = readSeed();
const OTHER_SUB = 'e2e-cal-scope-other';
let myOtherBandId = '';
let strangerBandId = '';
let ownEventId = '';

/** The 15th of the month on screen — inside the grid whatever today is. */
const midMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
};

const event = (bandId: string, title: string, createdBy = seed.userId) =>
  createEvent({
    bandId,
    title,
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
    createdBy,
  });

test.beforeAll(async () => {
  const other = await upsertUser({
    googleSub: OTHER_SUB,
    email: 'e2e-cal-scope-other@noodle.test',
    name: 'Cal Scope Other',
  });

  myOtherBandId = (await createBand(seed.userId, 'E2E Cal Second')).id;
  // A band the seeded user is *not* in, so the only way its event can be seen
  // is the personal invite added below.
  strangerBandId = (await createBand(other.id, 'E2E Cal Stranger')).id;

  ownEventId = (await event(seed.bandId, 'E2E Cal Mine')).id;
  await event(myOtherBandId, 'E2E Cal Other Band');
  const invited = await event(strangerBandId, 'E2E Cal Invited', other.id);
  await addEventMember(invited.id, seed.userId);
});

test.afterAll(async () => {
  // Deleting the bands takes their events; the seeded band's event is ours to
  // clean up, or it turns up in other specs' windows.
  await deleteEvent(ownEventId);
  await deleteBand(myOtherBandId);
  await deleteBand(strangerBandId);
  await deleteUsersByGoogleSub([OTHER_SUB]);
});

/** Open the calendar with `bandId` as the app's current band. */
async function calendarAs(page: import('@playwright/test').Page, bandId: string) {
  await page.addInitScript(
    (id) => localStorage.setItem('selectedBandId', id),
    bandId,
  );
  await page.goto('/scheduling');
  // The grid is band-scoped and renders nothing until the band list resolves.
  await expect(
    page.getByRole('button', { name: 'Calendar actions' }),
  ).toBeVisible();
}

test('shows the current band’s events, and not another band’s', async ({
  page,
}) => {
  await calendarAs(page, seed.bandId);

  await expect(page.getByText('E2E Cal Mine')).toBeVisible();
  await expect(page.getByText('E2E Cal Other Band')).toHaveCount(0);
});

test('an event you were personally invited to always shows', async ({
  page,
}) => {
  await calendarAs(page, seed.bandId);
  await expect(page.getByText('E2E Cal Invited')).toBeVisible();
});

test('switching band switches which events are on the grid', async ({
  page,
}) => {
  await calendarAs(page, myOtherBandId);

  await expect(page.getByText('E2E Cal Other Band')).toBeVisible();
  await expect(page.getByText('E2E Cal Mine')).toHaveCount(0);
  // Still not this band's, still visible.
  await expect(page.getByText('E2E Cal Invited')).toBeVisible();
});
