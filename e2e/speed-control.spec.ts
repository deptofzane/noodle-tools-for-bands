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

/**
 * The arrows can't be clicked here for the same reason the field can't be
 * typed in — they're disabled until the audio loads. Stepping is
 * `stepSpeed`, tested in scripts/tests; this pins where they sit.
 */
test('the phone layout has slow down left of the field, speed up right', async ({
  page,
}) => {
  await openPractice(page);
  const down = await page
    .getByRole('button', { name: 'Slow down 5%' })
    .boundingBox();
  const box = await field(page).boundingBox();
  const up = await page
    .getByRole('button', { name: 'Speed up 5%' })
    .boundingBox();
  expect(down!.x + down!.width).toBeLessThanOrEqual(box!.x);
  expect(up!.x).toBeGreaterThanOrEqual(box!.x + box!.width);
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false });

  test('the rail stacks speed up above the field, slow down below', async ({
    page,
  }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    await field(page).waitFor();
    const up = await page
      .getByRole('button', { name: 'Speed up 5%' })
      .boundingBox();
    const box = await field(page).boundingBox();
    const down = await page
      .getByRole('button', { name: 'Slow down 5%' })
      .boundingBox();
    expect(up!.y + up!.height).toBeLessThanOrEqual(box!.y);
    expect(down!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
  });
});
