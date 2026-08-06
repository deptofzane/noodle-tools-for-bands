import { test, expect } from '@playwright/test';
import { E2E, readSeed } from './fixtures';

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

  // The row reports the stored copy when it's done.
  await expect(page.getByText('✓ Offline')).toBeVisible({ timeout: 120_000 });

  // Cut the network. The offline screen lists what's saved on the device.
  await context.setOffline(true);
  await page.goto('/offline');
  await expect(page.getByText(E2E.setlistName).first()).toBeVisible({
    timeout: 30_000,
  });

  // …and Practice opens from it. Practice rather than Live for the check:
  // Live is a chrome-free sheet view that prints no title, so there'd be
  // nothing to assert on but the rendered PDF. Both come from the same
  // precached shell, so if one opens offline the shell and data are there.
  await page.getByRole('link', { name: 'Practice' }).first().click();
  await expect(page.getByText(E2E.songName).first()).toBeVisible({
    timeout: 30_000,
  });

  await context.setOffline(false);
});
