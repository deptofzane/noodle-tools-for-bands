import '../scripts/load-env';
import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { upsertUser } from '../lib/db/users';
import { deleteUsersByGoogleSub } from '../lib/db/accounts';
import { addMember, createBand, deleteBand } from '../lib/db/bands';
import { createNotification } from '../lib/db/notifications';
import { createTodo } from '../lib/db/todos';
import { createEvent } from '../lib/db/events';

/**
 * Home as two tabs. What these guard against:
 *
 * - the notification feed marking everything read while you sit on Activity —
 *   it marks read on mount, so a panel mounted early (or hidden with CSS)
 *   would clear the badge for notifications nobody saw;
 * - the band picker filtering only some of what Activity lists;
 * - "recent" quietly staying at its old 24-hour reach.
 */
const seed = readSeed();
const OTHER_SUB = 'e2e-home-tabs-other';
let secondBandId = '';

/** A local `YYYY-MM-DD`, `offset` days from today. */
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};

const event = (title: string, date: string, bandId = seed.bandId) =>
  createEvent({
    bandId,
    title,
    eventType: 'Show',
    date,
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

const todo = (title: string, bandId: string) =>
  createTodo({
    bandId,
    creatorId: seed.userId,
    title,
    description: null,
    shared: false,
    ownerId: null,
    deadline: null,
    links: [],
  });

test.beforeAll(async () => {
  const other = await upsertUser({
    googleSub: OTHER_SUB,
    email: 'e2e-home-tabs-other@noodle.test',
    name: 'Other Member',
  });
  await addMember(seed.bandId, other.id, 'member');
  // Someone else's action, so it counts as unread for the seeded user.
  await createNotification({
    bandId: seed.bandId,
    actorId: other.id,
    kind: 'audio-added',
    subjectType: 'conversation',
    subjectLabel: 'E2E Home Tabs Upload',
  });

  secondBandId = (await createBand(seed.userId, 'E2E Home Second')).id;
  await todo('E2E Home Todo A', seed.bandId);
  await todo('E2E Home Todo B', secondBandId);

  await event('E2E Week Show', day(2));
  await event('E2E Recent In', day(-3));
  await event('E2E Recent Out', day(-8));
});

test.afterAll(async () => {
  await deleteBand(secondBandId);
  await deleteUsersByGoogleSub([OTHER_SUB]);
});

test('Activity does not mark notifications read; opening Notifications does', async ({
  page,
}) => {
  const reads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/notifications/read'))
      reads.push(r.url());
  });
  // Arrive with Activity remembered — the case where a feed mounted for one
  // frame before the saved tab applied would mark everything read.
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');

  await expect(page.getByRole('tab', { name: /Activity/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('E2E Home Todo A')).toBeVisible();
  // The pill carries the unread count while its tab is closed.
  await expect(page.getByRole('tab', { name: /Notifications/ })).toContainText(
    /\d/,
  );
  await page.waitForTimeout(1500);
  expect(reads).toEqual([]);

  // Positive control: the same listener does see a read when it happens.
  const read = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/api/notifications/read'),
  );
  await page.getByRole('tab', { name: /Notifications/ }).click();
  await read;
  await expect(page.getByText('E2E Home Tabs Upload').first()).toBeVisible();
});

test('the band picker narrows todos and events together', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');

  await expect(page.getByText('E2E Home Todo A')).toBeVisible();
  await expect(page.getByText('E2E Home Todo B')).toBeVisible();
  // Rendered twice — desktop grid and phone list — with CSS choosing one, so
  // ask for the visible copy rather than the first in the DOM.
  await expect(
    page.getByText('E2E Week Show').filter({ visible: true }),
  ).toBeVisible();

  await page.getByRole('combobox', { name: 'Band' }).click();
  await page.getByRole('option', { name: 'E2E Home Second' }).click();

  await expect(page.getByText('E2E Home Todo B')).toBeVisible();
  await expect(page.getByText('E2E Home Todo A')).toHaveCount(0);
  // The week show belongs to the other band, so it goes too.
  await expect(page.getByText('E2E Week Show')).toHaveCount(0);
});

test('the phone lists all seven days of the rolling week', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');
  const week = page.getByRole('region', { name: 'Upcoming events' });
  // Today and Tomorrow by name, then five more — including the seventh, which
  // is the one a list cut short by a fixed bar would lose.
  await expect(week.locator('ol > li > h3')).toHaveCount(7);
  await expect(week.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(week.getByRole('heading', { name: 'Tomorrow' })).toBeVisible();
});

test('Recent events reaches back seven days, and no further', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');

  const toggle = page.getByRole('button', { name: /Recent events/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();

  await expect(page.getByText('E2E Recent In')).toBeVisible();
  await expect(page.getByText('E2E Recent Out')).toHaveCount(0);
});

test('the chosen tab is remembered across visits', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('tab', { name: /Activity/ }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: /Activity/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
