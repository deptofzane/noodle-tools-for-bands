import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';

const seed = readSeed();

/**
 * Whether the transport handler claimed a key.
 *
 * Asserted via `defaultPrevented` rather than by watching the clock: the
 * seeded audio is dummy bytes that never become ready, so `forward10` no-ops
 * even when the key is correctly handled. What's under test is the guard —
 * which elements the arrows are honoured from.
 */
async function arrowClaimed(page: Page, key: string) {
  return page.evaluate((k) => {
    const e = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement ?? document.body).dispatchEvent(e);
    return e.defaultPrevented;
  }, key);
}

test.describe('practice transport keys', () => {
  test('arrows are claimed with nothing focused', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    expect(await arrowClaimed(page, 'ArrowRight')).toBe(true);
    expect(await arrowClaimed(page, 'ArrowLeft')).toBe(true);
  });

  test('arrows still work after clicking a button', async ({ page }) => {
    // The regression this fixes: focus stays on whatever you last clicked,
    // and buttons used to be excluded — so the arrows went dead for good.
    await page.goto(`/notes/${seed.songId}/practice`);
    await page.getByRole('button', { name: 'Playback options' }).click();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      'BUTTON',
    );
    expect(await arrowClaimed(page, 'ArrowRight')).toBe(true);
    expect(await arrowClaimed(page, 'ArrowLeft')).toBe(true);
  });

  test('arrows are left alone while typing', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    // The note composer, rather than the speed field: that one is disabled
    // until the audio is ready, so focus would never land on it here.
    await page
      .getByRole('button', { name: '+ Add note at current time' })
      .click();
    await page.locator('textarea').first().focus();
    // A focused textarea owns its own arrows.
    expect(await arrowClaimed(page, 'ArrowRight')).toBe(false);
    expect(await arrowClaimed(page, 'ArrowLeft')).toBe(false);
  });

  test('space is not stolen from a focused button', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    await page.getByRole('button', { name: 'Playback options' }).click();
    expect(await arrowClaimed(page, ' ')).toBe(false);
  });
});
