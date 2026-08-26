import { test, expect } from '@playwright/test';
import { readSeed, E2E } from './fixtures';
import { findOrCreateConversation } from '../lib/db/conversations';
import { addAudioVersion, listAudioVersions } from '../lib/db/song-files';
import { Readable } from 'node:stream';

const seed = readSeed();
const SECOND = 'E2E Drag Second Song';

/**
 * The queue only offers a reorder handle once there are two songs in it, so
 * the band needs a second playable song to put there. Find-or-create, so a
 * worker restart doesn't pile up duplicates.
 */
test.beforeAll(async () => {
  const song = await findOrCreateConversation(
    seed.bandId,
    'e2e-drag-second',
    SECOND,
  );
  if ((await listAudioVersions(song.id)).length === 0) {
    const bytes = Buffer.alloc(8 * 1024, 5);
    await addAudioVersion({
      conversationId: song.id,
      body: Readable.from(bytes),
      sizeBytes: bytes.length,
      fileName: 'e2e-drag-second.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'e2e-audio-drag-second',
    });
  }
});

/**
 * The reorder handle has to be big enough to hit with a thumb. 44px is the
 * usual floor; below that a touch lands on the row instead and the page
 * scrolls rather than the song moving.
 */
test('the setlist reorder handle is a 44px touch target', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/setlists/${seed.setlistId}/edit`);
  const handle = page
    .getByRole('button', { name: new RegExp(`Reorder ${E2E.songName}`) })
    .first();
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box, 'handle should be laid out').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Still opts out of native touch scrolling.
  await expect(handle).toHaveCSS('touch-action', 'none');
});

test('the queue reorder handle matches it', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);

  for (const title of [E2E.songName, SECOND]) {
    const row = page.locator('li', { hasText: title }).first();
    await row.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('menuitem', { name: 'Add song to queue' }).click();
  }
  await page.getByRole('tab', { name: 'Song queue', exact: true }).click();
  // The queue hides its handles behind an explicit Arrange mode.
  await page.getByRole('button', { name: 'Arrange' }).click();

  const handle = page.getByRole('button', { name: /^Reorder/ }).first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
