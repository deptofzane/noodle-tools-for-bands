import '../scripts/load-env';
import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { createEvent, listBandEvents } from '../lib/db/events';

/**
 * "Clone event" opens the create screen prefilled from an existing event,
 * with the date blank — that blank is the point, so it gets its own
 * assertion, as does the multi-day span the clone rebuilds instead.
 */
const seed = readSeed();
const SOURCE = 'E2E Clone Source';

let eventId = '';

/*
 * Found before created, like the menu fixtures: a failed test restarts the
 * worker and re-runs this hook, and a second event of the same name would
 * make `listBandEvents(...).find` ambiguous for everything after it.
 */
test.beforeAll(async () => {
  const existing = (await listBandEvents(seed.bandId)).find(
    (e) => e.title === SOURCE,
  );
  eventId =
    existing?.id ??
    (
      await createEvent({
        bandId: seed.bandId,
        title: SOURCE,
        eventType: 'Show',
        // Fri–Sun: two days beyond the start, which is what the clone has to
        // reconstruct once a new date is typed.
        date: '2030-06-07',
        endDate: '2030-06-09',
        time: '20:00',
        endTime: '23:00',
        location: 'E2E Clone Hall',
        details: 'E2E clone details',
        notes: 'E2E clone private notes',
        setlistId: seed.setlistId,
        venueId: null,
        createdBy: seed.userId,
      })
    ).id;
});

test('the event page menu clones into a prefilled create screen', async ({
  page,
}) => {
  await page.goto(`/calendar/events/${eventId}`);
  await page.getByRole('button', { name: 'Event actions' }).click();
  await page.getByRole('menuitem', { name: 'Clone event' }).click();

  await expect(page).toHaveURL(`/calendar/events/new?cloneFrom=${eventId}`);

  // Everything but the date came across — including the private notes.
  await expect(page.getByLabel('Title')).toHaveValue(SOURCE);
  await expect(page.getByLabel('Location')).toHaveValue('E2E Clone Hall');
  await expect(page.getByLabel('Start time')).toHaveValue('20:00');
  await expect(page.getByLabel('End time')).toHaveValue('23:00');
  await expect(page.getByLabel('Details')).toHaveValue('E2E clone details');
  // Carried over by choice: the band's private notes come with the copy.
  await expect(page.getByLabel('Notes')).toHaveValue('E2E clone private notes');

  // The one field the user has to supply.
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('End date')).toHaveValue('');
});

test('a cloned multi-day event keeps its length once a date is picked', async ({
  page,
}) => {
  await page.goto(`/calendar/events/new?cloneFrom=${eventId}`);

  await page.getByLabel('Date', { exact: true }).fill('2031-02-27');
  // Two days beyond the start, and across a month boundary.
  await expect(page.getByLabel('End date')).toHaveValue('2031-03-01');

  // A hand-set end date stops following the start, as the end *time* does.
  await page.getByLabel('End date').fill('2031-03-05');
  await page.getByLabel('Date', { exact: true }).fill('2031-02-28');
  await expect(page.getByLabel('End date')).toHaveValue('2031-03-05');
});

test('the Events tab menu offers the same clone', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}?tab=events`);
  // Scoped to this event's own row, not `.first()` — the seeded band holds
  // several events and their order is not this test's business.
  await page
    .getByRole('listitem')
    .filter({ hasText: SOURCE })
    .getByLabel('Event actions')
    .click();
  await page.getByRole('menuitem', { name: 'Clone event' }).click();

  await expect(page).toHaveURL(/\/calendar\/events\/new\?cloneFrom=/);
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('');
});
