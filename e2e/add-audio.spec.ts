import '../scripts/load-env';
import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import {
  deleteConversation,
  findOrCreateConversation,
} from '../lib/db/conversations';

/**
 * Adding audio to a song that has none — from the Practice page's "Add audio"
 * button, and (the same chooser, now shared) the Edit page's "Add version".
 * Uploads a real two-second WAV through the real route, so what's checked is
 * that the song ends up playable, not just that a modal opened.
 */
const seed = readSeed();
const songs: Record<'practice' | 'edit', string> = { practice: '', edit: '' };

test.beforeAll(async () => {
  songs.practice = (
    await findOrCreateConversation(seed.bandId, 'e2e-no-audio-1', 'E2E Silent A')
  ).id;
  songs.edit = (
    await findOrCreateConversation(seed.bandId, 'e2e-no-audio-2', 'E2E Silent B')
  ).id;
});

test.afterAll(async () => {
  for (const id of Object.values(songs)) if (id) await deleteConversation(id);
});

function toneWav(seconds: number, rate = 8000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  }
  return buf;
}

/** Pick "Upload a local file" in the open chooser and hand it a WAV. */
async function uploadThroughChooser(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Add audio version' });
  await expect(dialog).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Upload a local file' }).click();
  await (
    await chooser
  ).setFiles({ name: 'e2e-added.wav', mimeType: 'audio/wav', buffer: toneWav(2) });
  await expect(page.getByText('Version added.')).toBeVisible({ timeout: 15_000 });
}

test('Practice: a song with no audio offers "Add audio", and the player appears once added', async ({
  page,
}) => {
  await page.goto(`/notes/${songs.practice}/practice`);
  await expect(page.getByText('No audio yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add audio' }).click();
  await uploadThroughChooser(page);

  // No reload: the new version is laid over the page's song.
  await expect(page.getByText('No audio yet.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play' }).first()).toBeEnabled({
    timeout: 15_000,
  });
});

test('Practice: the chooser can be cancelled', async ({ page }) => {
  await page.goto(`/notes/${songs.edit}/practice`);
  await page.getByRole('button', { name: 'Add audio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add audio version' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('No audio yet.')).toBeVisible();
});

test('Edit: "Add version" still adds through the shared chooser', async ({
  page,
}) => {
  await page.goto(`/notes/${songs.edit}/edit`);
  // Sheet music has an "Add version" too.
  const audio = page.locator('section', {
    has: page.getByRole('heading', { name: 'Audio versions' }),
  });
  await audio.getByRole('button', { name: 'Add version' }).click();
  await uploadThroughChooser(page);
  await expect(audio.getByText('e2e-added.wav')).toBeVisible();
});
