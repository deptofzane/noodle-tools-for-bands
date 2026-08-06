import '../scripts/load-env';
import { Readable } from 'node:stream';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  addAudioVersion,
  addSheetVersion,
  deleteAudioVersion,
  deleteSheetVersion,
  setDefaultAudioVersion,
} from '../lib/db/song-files';

/**
 * Download the setlist shown on the current page and wait for it to land.
 *
 * The desktop layout offers a button, the phone layout a kebab; the suite runs
 * phone-shaped, but handling both keeps this usable if that changes.
 */
export async function downloadSetlist(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 60_000 },
  );

  const kebab = page.getByRole('button', { name: 'Setlist actions' });
  if (await kebab.isVisible()) {
    await kebab.click();
    await page.getByRole('menuitem', { name: /download/i }).click();
  } else {
    await page.getByRole('button', { name: /^Download$/ }).click();
  }
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('✓ Offline')).toBeVisible({ timeout: 120_000 });
}

/** Add a second audio take and make it the song's default. Returns its id. */
export async function addDefaultAudioVersion(
  conversationId: string,
): Promise<string> {
  const bytes = Buffer.alloc(16 * 1024, 9);
  const version = await addAudioVersion({
    conversationId,
    body: Readable.from(bytes),
    sizeBytes: bytes.length,
    fileName: 'e2e-take-2.mp3',
    mimeType: 'audio/mpeg',
    driveFileId: `e2e-audio-${Date.now()}`,
  });
  // A new version isn't the default on its own — and it's the default that
  // the downloaded copy pinned, so that's what has to move.
  await setDefaultAudioVersion(conversationId, version.id);
  return version.id;
}

export async function removeAudioVersion(
  conversationId: string,
  versionId: string,
): Promise<void> {
  await deleteAudioVersion(conversationId, versionId);
}

/** Upload another sheet-music version for a song. Returns its id. */
export async function addSheet(conversationId: string): Promise<string> {
  const bytes = Buffer.from('%PDF-1.4\n% e2e second chart\n');
  const version = await addSheetVersion({
    conversationId,
    body: Readable.from(bytes),
    sizeBytes: bytes.length,
    fileName: 'e2e-chart-2.pdf',
    mimeType: 'application/pdf',
    driveFileId: `e2e-sheet-${Date.now()}`,
  });
  return version.id;
}

export async function removeSheet(
  conversationId: string,
  versionId: string,
): Promise<void> {
  await deleteSheetVersion(conversationId, versionId);
}
