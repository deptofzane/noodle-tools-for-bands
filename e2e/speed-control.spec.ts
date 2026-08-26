import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';

const seed = readSeed();
const field = (p: Page) =>
  p.getByRole('spinbutton', { name: /Playback speed/ });

/**
 * The speed field lives in the player's collapsible options panel, which
 * starts closed on a fresh context.
 *
 * What's asserted here is the shape of the control — a number field with the
 * right bounds, starting at 100. The clamping behind it can't be driven from
 * a browser here: the field is disabled until the audio is ready, and the
 * seeded fixture is dummy bytes that never load. That logic is pure and lives
 * in `lib/playback-speed.ts`, tested directly in scripts/tests.
 */
async function openPractice(p: Page) {
  await p.goto(`/notes/${seed.songId}/practice`);
  const toggle = p.getByRole('button', { name: 'Playback options' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await field(p).waitFor();
}

test('practice speed is a number field starting at 100', async ({ page }) => {
  await openPractice(page);
  await expect(field(page)).toHaveValue('100');
  await expect(field(page)).toHaveAttribute('type', 'number');
  await expect(field(page)).toHaveAttribute('min', '25');
  await expect(field(page)).toHaveAttribute('max', '200');

  // The dropdown it replaced is gone.
  await expect(page.locator('select[aria-label="Playback speed"]')).toHaveCount(
    0,
  );
});
