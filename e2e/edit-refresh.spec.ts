import { test, expect } from '@playwright/test';
import { E2E, readSeed } from './fixtures';

/**
 * Editing a song and going back must show the edit.
 *
 * This is the one that has actually broken. Edit screens used to call
 * `router.refresh()` just before navigating away, which refetches the route
 * being *left*; `router.back()` then restored the destination from the client
 * Router Cache exactly as it was, still showing pre-edit data.
 * `RefreshAfterEdit` in the root layout fixes it by refreshing once the
 * destination is the current route.
 *
 * None of that is reachable from a Node test — it is entirely Next's
 * client-side router — which is why the bug survived two rounds of "verified".
 */
test('renaming a song shows on the song page after Save', async ({ page }) => {
  const { songId } = readSeed();

  await page.goto(`/notes/${songId}`);
  await expect(page.getByText(E2E.songName).first()).toBeVisible();

  // Edit lives in the song's kebab, on the "Song details" header row — it used
  // to be a link in the back-nav header. It is now a glyph in an icon row, so
  // its accessible name is the aria-label rather than the visible words.
  await page.getByRole('button', { name: 'Song actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit this song' }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${songId}/edit$`));

  const name = page.locator('input[type="text"], input:not([type])').first();
  await name.fill(E2E.renamedSong);
  await page.getByRole('button', { name: 'Save' }).click();

  // Back on the song page, showing the new name — not the cached old one.
  await expect(page).toHaveURL(new RegExp(`/notes/${songId}$`));
  await expect(page.getByText(E2E.renamedSong).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(E2E.songName, { exact: true })).toHaveCount(0);

  // Put it back so the spec can run twice against one seed.
  await page.goto(`/notes/${songId}/edit`);
  await page
    .locator('input[type="text"], input:not([type])')
    .first()
    .fill(E2E.songName);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${songId}$`));
});
