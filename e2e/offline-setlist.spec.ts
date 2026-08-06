import { test, expect } from '@playwright/test';
import { E2E, readSeed } from './fixtures';
import {
  addDefaultAudioVersion,
  addSheet,
  downloadSetlist,
  removeAudioVersion,
  removeSheet,
} from './helpers';

/**
 * A downloaded setlist has to work with the network gone.
 *
 * It's the app's central promise — bands perform where the wifi doesn't reach
 * — and the most fragile machinery in it: service worker, precached page
 * shells, versioned audio cache keys, IndexedDB. None of that exists in a Node
 * test, and none of it exists in a dev build either (the worker is disabled
 * there; see next.config.ts), which is why this suite runs against a
 * production build.
 */
test('a downloaded setlist opens Practice with no network', async ({
  page,
  context,
}) => {
  const { bandId, setlistId } = readSeed();

  await page.goto(`/bands/${bandId}/setlists/${setlistId}`);
  await expect(
    page.getByRole('heading', { name: E2E.setlistName }),
  ).toBeVisible();

  // Nothing is cacheable until the worker is controlling the page.
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 60_000 },
  );

  // Download it: the desktop row has a button, the phone layout a kebab.
  const kebab = page.getByRole('button', { name: 'Setlist actions' });
  if (await kebab.isVisible()) {
    await kebab.click();
    await page.getByRole('menuitem', { name: /download/i }).click();
  } else {
    await page.getByRole('button', { name: /^Download$/ }).click();
  }
  await page.getByRole('button', { name: 'Download', exact: true }).click();

  // The row reports the stored copy when it's done, and says nothing about it
  // being behind — nothing has changed yet.
  await expect(page.getByText('✓ Offline')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Needs update')).toHaveCount(0);

  // Cut the network — twice over.
  //
  // `setOffline` blocks requests but leaves `navigator.onLine` true, and the
  // offline screen reads that flag to decide whether its buttons are live. So
  // the flag has to be emulated as well, or the page renders its online self
  // and this spec sails past exactly the bug it's meant to catch.
  await context.setOffline(true);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  });
  await page.goto('/offline');
  await expect(page.getByText(E2E.setlistName).first()).toBeVisible({
    timeout: 30_000,
  });

  // The page must *know* it is offline, or the rest of this proves nothing:
  // the buttons stay enabled while `navigator.onLine` is true, so a spec that
  // skipped this would pass straight through a bug that disables them.
  await expect
    .poll(() => page.evaluate(() => navigator.onLine), { timeout: 10_000 })
    .toBe(false);
  await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible();

  // Enabled, not the disabled span shown for a setlist whose data is missing.
  const practice = page.getByRole('link', { name: 'Practice' }).first();
  await expect(practice).toBeVisible();

  // …and Practice opens from it. Practice rather than Live for the check:
  // Live is a chrome-free sheet view that prints no title, so there'd be
  // nothing to assert on but the rendered PDF. Both come from the same
  // precached shell, so if one opens offline the shell and data are there.
  await practice.click();
  await expect(page.getByText(E2E.songName).first()).toBeVisible({
    timeout: 30_000,
  });

  await context.setOffline(false);
});

/**
 * A downloaded copy that has fallen behind says so — and only about the parts
 * that were downloaded.
 *
 * Changes are made straight in the database: they're what the badge exists
 * for, and no amount of clicking in this browser would produce them. The
 * download modal defaults to sheets only, which is what most people will have,
 * so that's what this exercises.
 */
test('a setlist changed since download is flagged, respecting choices', async ({
  page,
}) => {
  const { bandId, setlistId, songId } = readSeed();

  await page.goto(`/bands/${bandId}/setlists/${setlistId}`);
  await downloadSetlist(page);
  await expect(page.getByText('Needs update')).toHaveCount(0);

  // A new default audio take, when only sheets were saved: not their problem.
  const audioId = await addDefaultAudioVersion(songId);
  try {
    await page.reload();
    await expect(page.getByText('✓ Offline')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Needs update')).toHaveCount(0);
  } finally {
    await removeAudioVersion(songId, audioId);
  }

  // New sheet music, which is exactly what they saved.
  const sheetId = await addSheet(songId);
  try {
    await page.reload();
    await expect(page.getByText('Needs update')).toBeVisible({
      timeout: 30_000,
    });
    // Still usable offline — that's why the badge keeps both halves.
    await expect(page.getByText('✓ Offline')).toBeVisible();
  } finally {
    await removeSheet(songId, sheetId);
  }
});
