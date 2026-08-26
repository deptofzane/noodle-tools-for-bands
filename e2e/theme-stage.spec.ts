import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { THEMES, THEME_LABELS } from '../app/theme';

const seed = readSeed();
const picker = (p: Page) => p.getByRole('group', { name: 'Theme' });
const state = (p: Page) =>
  p.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    override: document.documentElement.dataset.themeOverride ?? null,
    page: getComputedStyle(document.documentElement)
      .getPropertyValue('--page')
      .trim(),
  }));

async function appearance(p: Page) {
  await p.goto('/settings');
  await p.getByRole('tab', { name: 'Appearance' }).click();
  await expect(picker(p)).toBeVisible();
}

test('every registered theme has a button', async ({ page }) => {
  await appearance(page);
  // Derived from the source of truth, so adding a theme doesn't fail a test
  // that has nothing to do with it — which it has done twice now.
  await expect(picker(page).getByRole('button')).toHaveText(
    THEMES.map((t) => THEME_LABELS[t]),
  );
});

test('Stage and Rosé Pine each apply their own palette', async ({ page }) => {
  await appearance(page);
  await picker(page).getByRole('button', { name: 'Stage' }).click();
  expect((await state(page)).page).toBe('#080808');

  await picker(page).getByRole('button', { name: 'Rosé Pine' }).click();
  expect((await state(page)).page).toBe('#191724');
});

test('Rosé Pine re-tints the calendar and todo colours', async ({ page }) => {
  await appearance(page);
  await picker(page).getByRole('button', { name: 'Rosé Pine' }).click();
  await page.goto(`/bands/${seed.bandId}?tab=todos`);

  const seen = await page.evaluate(() => {
    const read = (type: string) => {
      const el = document.createElement('div');
      el.setAttribute('data-event-type', type);
      document.body.appendChild(el);
      const v = getComputedStyle(el).getPropertyValue('--event-accent').trim();
      el.remove();
      return v;
    };
    return {
      practice: read('practice'),
      writing: read('writing'),
      studio: read('studio'),
      show: read('show'),
    };
  });
  // In-palette, and still four distinct hues — the category coding survives.
  expect(seen.practice).toBe('#9ccfd8');
  expect(seen.writing).toBe('#3e8fb0');
  expect(seen.studio).toBe('#c4a7e7');
  expect(seen.show).toBe('#eb6f92');
  expect(new Set(Object.values(seen)).size).toBe(4);
});

test('other themes leave the category colours alone', async ({ page }) => {
  await appearance(page);
  await picker(page).getByRole('button', { name: 'Sepia' }).click();
  await page.goto(`/bands/${seed.bandId}?tab=todos`);
  const practice = await page.evaluate(() => {
    const el = document.createElement('div');
    el.setAttribute('data-event-type', 'practice');
    document.body.appendChild(el);
    const v = getComputedStyle(el).getPropertyValue('--event-accent').trim();
    el.remove();
    return v;
  });
  expect(practice).toBe('#8aadf4'); // the dark default, deliberately untinted
});

test.describe('stage while playing', () => {
  test('off by default: Live keeps your chosen theme', async ({ page }) => {
    await appearance(page);
    await picker(page).getByRole('button', { name: 'Rosé Pine' }).click();
    await page.goto(`/notes/${seed.songId}/practice`);
    const s = await state(page);
    expect(s.theme).toBe('rose-pine');
    expect(s.override).toBeNull();
  });

  test('on: Live switches to Stage, and leaving restores', async ({ page }) => {
    await appearance(page);
    await picker(page).getByRole('button', { name: 'Rosé Pine' }).click();
    await page
      .getByRole('checkbox', { name: /Use Stage while playing/ })
      .check();

    await page.goto(`/notes/${seed.songId}/practice`);
    const onStage = await state(page);
    expect(onStage.theme).toBe('stage');
    expect(onStage.override).toBe('on');
    expect(onStage.page).toBe('#080808');

    // ThemeKeeper must not fight the override back to the stored theme.
    await page.waitForTimeout(400);
    expect((await state(page)).theme).toBe('stage');

    await page.goto('/home');
    const back = await state(page);
    expect(back.theme).toBe('rose-pine');
    expect(back.override).toBeNull();
  });
});
