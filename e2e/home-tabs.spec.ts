import '../scripts/load-env';
import { test, expect } from '@playwright/test';
import { readSeed } from './fixtures';
import { upsertUser } from '../lib/db/users';
import { deleteUsersByGoogleSub } from '../lib/db/accounts';
import { addMember, createBand, deleteBand } from '../lib/db/bands';
import { createNotification } from '../lib/db/notifications';
import { createTodo, deleteTodo } from '../lib/db/todos';
import { createEvent, deleteEvent } from '../lib/db/events';

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
/**
 * Rows created in the *seeded* band, which nothing else tears down — deleting
 * the second band takes its own todo with it, but these would survive the run
 * and come back as a duplicate on the next one, which reads as a strict-mode
 * violation rather than as leftover data.
 */
const madeInSeedBand: { todos: string[]; events: string[] } = {
  todos: [],
  events: [],
};

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
  madeInSeedBand.todos.push((await todo('E2E Home Todo A', seed.bandId)).id);
  await todo('E2E Home Todo B', secondBandId);

  for (const [title, offset] of [
    ['E2E Week Show', 2],
    ['E2E Recent In', -3],
    ['E2E Recent Out', -8],
  ] as const) {
    madeInSeedBand.events.push((await event(title, day(offset))).id);
  }
});

test.afterAll(async () => {
  for (const id of madeInSeedBand.events) await deleteEvent(id);
  for (const id of madeInSeedBand.todos) await deleteTodo(id);
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

  // The week is collapsed by default now, and it's one of the things the
  // picker narrows — so open it before asking what it lists.
  const toggle = page.getByRole('button', { name: /^This week/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();

  // Scoped to the week: the month calendar below lists the same event, so a
  // page-wide search for it matches twice.
  const week = page.getByRole('region', { name: 'This week' });
  await expect(week.getByText('E2E Week Show')).toBeVisible();

  await page.getByRole('combobox', { name: 'Band' }).click();
  await page.getByRole('option', { name: 'E2E Home Second' }).click();

  await expect(page.getByText('E2E Home Todo B')).toBeVisible();
  await expect(page.getByText('E2E Home Todo A')).toHaveCount(0);
  // The week show belongs to the other band, so it goes too.
  await expect(week.getByText('E2E Week Show')).toHaveCount(0);
});

test('the week lists all seven days', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');
  // Collapsed by default now that the month calendar sits below it.
  const toggle = page.getByRole('button', { name: /^This week/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();

  const week = page.getByRole('region', { name: 'This week' });
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

  // By role, not by text: the month calendar below lists these same events,
  // and both are inside the current month. Its bars sit in an aria-hidden
  // overlay with no role, so asking for the link asks only about this list.
  await expect(page.getByRole('link', { name: 'E2E Recent In' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'E2E Recent Out' }),
  ).toHaveCount(0);
});

test('Todos starts expanded, This week folded, and both remember', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('homeTab', 'activity'));
  await page.goto('/home');

  const todos = page.getByRole('button', { name: /^Todos/ });
  const week = page.getByRole('button', { name: /^This week/ });
  // First view: todos open, the week folded away behind its toggle now that
  // the month calendar covers the same ground below it.
  await expect(todos).toHaveAttribute('aria-expanded', 'true');
  await expect(week).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('E2E Home Todo A')).toBeVisible();

  await todos.click();
  await expect(todos).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('E2E Home Todo A')).toHaveCount(0);
  // Independent: minimizing one leaves the other alone.
  await expect(week).toHaveAttribute('aria-expanded', 'false');

  // A default only applies until you say otherwise: opening the week has to
  // survive a reload, the same as closing todos does.
  await week.click();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Todos/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(
    page.getByRole('button', { name: /^This week/ }),
  ).toHaveAttribute('aria-expanded', 'true');
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
