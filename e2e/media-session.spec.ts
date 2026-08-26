import { test, expect, type Page } from '@playwright/test';
import { readSeed, E2E } from './fixtures';
import { findOrCreateConversation } from '../lib/db/conversations';
import { addAudioVersion, listAudioVersions } from '../lib/db/song-files';
import { Readable } from 'node:stream';

const seed = readSeed();
const SECOND = 'E2E Media Second Song';

test.beforeAll(async () => {
  const song = await findOrCreateConversation(
    seed.bandId,
    'e2e-media-second',
    SECOND,
  );
  if ((await listAudioVersions(song.id)).length === 0) {
    const bytes = Buffer.alloc(8 * 1024, 4);
    await addAudioVersion({
      conversationId: song.id,
      body: Readable.from(bytes),
      sizeBytes: bytes.length,
      fileName: 'e2e-media-second.mp3',
      mimeType: 'audio/mpeg',
      driveFileId: 'e2e-audio-media-second',
    });
  }
});

/**
 * There's no way to read back a registered Media Session handler, so the
 * setter is wrapped before any app code runs and every call recorded.
 */
async function spyOnMediaSession(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ms: Record<string, boolean> };
    w.__ms = {};
    const ms = navigator.mediaSession;
    if (!ms) return;
    const real = ms.setActionHandler.bind(ms);
    ms.setActionHandler = (action: MediaSessionAction, handler) => {
      w.__ms[action] = handler !== null;
      return real(action, handler);
    };
  });
}

const registered = (p: Page) =>
  p.evaluate(
    () => (window as unknown as { __ms: Record<string, boolean> }).__ms,
  );

async function queueSong(page: Page, title: string) {
  const row = page.locator('li', { hasText: title }).first();
  await row.getByRole('button', { name: 'Song actions' }).click();
  await page.getByRole('menuitem', { name: 'Add song to queue' }).click();
}

test('one queued song: next is withheld, previous is offered', async ({
  page,
}) => {
  await spyOnMediaSession(page);
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  await queueSong(page, E2E.songName);

  await expect
    .poll(async () => (await registered(page)).previoustrack)
    .toBe(true);
  const r = await registered(page);
  console.log('one song:', JSON.stringify(r));
  expect(r.nexttrack, 'nothing to skip to').toBe(false);
  expect(r.play).toBe(true);
});

test('two queued songs: skip both ways is handed to the OS', async ({
  page,
}) => {
  await spyOnMediaSession(page);
  await page.goto(`/bands/${seed.bandId}/audio?tab=songs`);
  await queueSong(page, E2E.songName);
  await queueSong(page, SECOND);

  await expect.poll(async () => (await registered(page)).nexttrack).toBe(true);
  const r = await registered(page);
  console.log('two songs:', JSON.stringify(r));
  expect(r.previoustrack).toBe(true);
  expect(r.seekforward).toBe(true);
  expect(r.seekbackward).toBe(true);
});
