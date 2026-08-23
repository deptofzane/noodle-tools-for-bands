import { test, expect } from '@playwright/test';
import { E2E, readSeed } from './fixtures';
import { createEvent } from '../lib/db/events';
import { createAlbum } from '../lib/db/albums';
import { db } from '../lib/db';
import { albums, events } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

const BASE = 'http://127.0.0.1:3123';
let eventId = '';
let albumId = '';

test.beforeAll(async () => {
  const { bandId, userId, setlistId, songId } = readSeed();
  const e = await createEvent({
    bandId, title: 'E2E Share Show', eventType: 'Show', date: '2026-11-22',
    endDate: null, time: null, endTime: null, location: null, details: null,
    notes: null, setlistId, venueId: null, createdBy: userId,
  });
  eventId = e.id;
  // Positional args, and it returns the id directly.
  albumId = await createAlbum(bandId, userId, 'E2E Share Album', [
    { conversationId: songId, audioVersionId: null },
  ]);
});

test.afterAll(async () => {
  if (eventId) await db.delete(events).where(eq(events.id, eventId));
  if (albumId) await db.delete(albums).where(eq(albums.id, albumId));
});

const clip = (page: import('@playwright/test').Page) =>
  page.evaluate(`navigator.clipboard.readText()`) as Promise<string>;

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('Overview → Events kebab shares both the event and its setlist', async ({ page }) => {
  const { bandId, setlistId } = readSeed();
  await page.goto(`/bands/${bandId}?tab=events`);
  await expect(page.getByText('E2E Share Show')).toBeVisible({ timeout: 20_000 });

  const kebab = page.locator('li').filter({ hasText: 'E2E Share Show' })
    .getByRole('button', { name: 'Event actions' }).first();

  await kebab.click();
  const items = (await page.getByRole('menuitem').allTextContents()).map((t) => t.trim());
  console.log('EVENT MENU', JSON.stringify(items.slice(0, 6)));
  // Share sits directly after its matching View.
  expect(items[items.indexOf('View event') + 1]).toBe('Share event');
  expect(items[items.indexOf('View setlist') + 1]).toBe('Share setlist');

  await page.getByRole('menuitem', { name: 'Share event' }).click();
  await expect(page.getByText('Event link copied.')).toBeVisible({ timeout: 10_000 });
  expect(await clip(page)).toBe(`${BASE}/calendar/events/${eventId}`);

  await kebab.click();
  await page.getByRole('menuitem', { name: 'Share setlist' }).click();
  await expect(page.getByText('Setlist link copied.')).toBeVisible({ timeout: 10_000 });
  expect(await clip(page)).toBe(`${BASE}/bands/${bandId}/setlists/${setlistId}`);
});

test('Setlists tab shares a setlist', async ({ page }) => {
  const { bandId, setlistId } = readSeed();
  await page.goto(`/bands/${bandId}/audio?tab=setlists`);
  await page.getByRole('button', { name: 'Setlist actions' }).first().click();
  const items = (await page.getByRole('menuitem').allTextContents()).map((t) => t.trim());
  expect(items[items.indexOf('View setlist') + 1]).toBe('Share setlist');

  await page.getByRole('menuitem', { name: 'Share setlist' }).click();
  await expect(page.getByText('Setlist link copied.')).toBeVisible({ timeout: 10_000 });
  const url = await clip(page);
  console.log('SETLIST', JSON.stringify(url));
  expect(url).toBe(`${BASE}/bands/${bandId}/setlists/${setlistId}`);

  await page.goto(url);
  await expect(page.getByText(E2E.setlistName).first()).toBeVisible({ timeout: 20_000 });
});

test('Songs tab shares a song, and the link opens it', async ({ page }) => {
  const { bandId, songId } = readSeed();
  await page.goto(`/bands/${bandId}/audio?tab=songs`);
  await page.getByRole('button', { name: 'Song actions' }).first().click();
  const items = (await page.getByRole('menuitem').allTextContents()).map((t) => t.trim());
  console.log('SONG MENU', JSON.stringify(items));
  expect(items[items.indexOf('View song') + 1]).toBe('Share song');

  await page.getByRole('menuitem', { name: 'Share song' }).click();
  await expect(page.getByText('Song link copied.')).toBeVisible({ timeout: 10_000 });
  const url = await clip(page);
  expect(url).toBe(`${BASE}/notes/${songId}`);

  await page.goto(url);
  await expect(page.getByText(E2E.songName).first()).toBeVisible({ timeout: 20_000 });
});

test('album view shares the album, and its tracks share as songs', async ({ page }) => {
  const { bandId, songId } = readSeed();
  await page.goto(`/bands/${bandId}/audio?tab=songs`);
  // Switch to the album view.
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Albums' }).click();
  await expect(page.getByText('E2E Share Album')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Actions for E2E Share Album' }).click();
  const items = (await page.getByRole('menuitem').allTextContents()).map((t) => t.trim());
  console.log('ALBUM MENU', JSON.stringify(items));
  expect(items[items.indexOf('View album') + 1]).toBe('Share album');

  await page.getByRole('menuitem', { name: 'Share album' }).click();
  await expect(page.getByText('Album link copied.')).toBeVisible({ timeout: 10_000 });
  const url = await clip(page);
  expect(url).toBe(`${BASE}/bands/${bandId}/albums/${albumId}`);
  await page.goto(url);
  await expect(page.getByText('E2E Share Album').first()).toBeVisible({ timeout: 20_000 });

  // A track inside an album is a SongRow, so it shares too. The album view is
  // remembered, so we're still in it — the album just has to be opened, since
  // its tracks aren't rendered while it's collapsed.
  await page.goto(`/bands/${bandId}/audio?tab=songs`);
  await expect(page.getByText('E2E Share Album')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Expand E2E Share Album/ }).click();
  const trackKebab = page.getByRole('button', { name: 'Song actions' }).first();
  await expect(trackKebab).toBeVisible({ timeout: 10_000 });
  await trackKebab.click();
  await page.getByRole('menuitem', { name: 'Share song' }).click();
  await expect(page.getByText('Song link copied.')).toBeVisible({ timeout: 10_000 });
  expect(await clip(page), 'an album track shares as a song').toBe(
    `${BASE}/notes/${songId}`,
  );
});
