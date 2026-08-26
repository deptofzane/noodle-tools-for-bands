import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { findOrCreateConversation } from '../lib/db/conversations';
import { addSheetVersion, listSheetVersions } from '../lib/db/song-files';
import { Readable } from 'node:stream';

const seed = readSeed();

const TEXT_SONG = 'E2E Text Chart Song';
let textSongId = '';

/**
 * A song whose chart is *text*, not a PDF — the seeded one is a PDF, and the
 * editor only appears for text sheets.
 */
test.beforeAll(async () => {
  const song = await findOrCreateConversation(
    seed.bandId,
    'e2e-text-chart',
    TEXT_SONG,
  );
  textSongId = song.id;
  if ((await listSheetVersions(song.id)).length === 0) {
    const body = Buffer.from('verse\nchorus\n');
    await addSheetVersion({
      conversationId: song.id,
      body: Readable.from(body),
      sizeBytes: body.length,
      fileName: 'e2e-chart.md',
      mimeType: 'text/markdown',
      driveFileId: 'e2e-sheet-text',
    });
  }
});

/** Open the sheet-music text editor on the song's Practice screen. */
async function openEditor(page: Page) {
  await page.goto(`/notes/${textSongId}/practice`);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const box = page.getByRole('textbox', { name: 'Sheet music content' });
  await expect(box).toBeVisible();
  return box;
}

test('Tab indents by four spaces instead of leaving the field', async ({
  page,
}) => {
  const box = await openEditor(page);
  await box.fill('verse');
  await box.press('Tab');
  await expect(box).toHaveValue('verse    ');
  // Focus stayed put — that's the whole point.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
    'TEXTAREA',
  );
});

test('Shift+Tab outdents', async ({ page }) => {
  const box = await openEditor(page);
  await box.fill('verse');
  await box.press('Tab');
  await expect(box).toHaveValue('verse    ');
  await box.press('Shift+Tab');
  await expect(box).toHaveValue('verse');
});

test('Escape then Tab moves focus out', async ({ page }) => {
  const box = await openEditor(page);
  await box.fill('verse');
  await box.press('Escape');
  await box.press('Tab');
  await expect(box).toHaveValue('verse');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'TEXTAREA',
  );
});

test('the escape hatch re-arms: a later Tab indents again', async ({
  page,
}) => {
  const box = await openEditor(page);
  await box.fill('verse');
  await box.press('Escape');
  await box.press('Tab');
  await box.focus();
  await box.press('Tab');
  await expect(box).toHaveValue('verse    ');
});

test('the trap is announced, not silent', async ({ page }) => {
  const box = await openEditor(page);
  const describedBy = await box.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toContainText(
    'Escape, then Tab',
  );
});
