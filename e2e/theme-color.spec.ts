import { test, expect, type Page } from '@playwright/test';

const content = (p: Page) =>
  p.locator('meta[name="theme-color"]').getAttribute('content');
const count = (p: Page) => p.locator('meta[name="theme-color"]').count();

test.describe('system bar colour follows the theme', () => {
  test('exactly one tag, matching the applied theme on arrival', async ({
    page,
  }) => {
    await page.goto('/home');
    // One tag, one writer: a second would leave the browser picking.
    expect(await count(page)).toBe(1);

    const dark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(await content(page)).toBe(dark ? '#171717' : '#ffffff');
  });

  test('it changes when the theme is switched', async ({ page }) => {
    await page.goto('/settings');
    // Settings opens on Account; the theme control is under Appearance. It's
    // a picker now, not a two-state toggle.
    await page.getByRole('tab', { name: 'Appearance' }).click();
    const picker = page.getByRole('group', { name: 'Theme' });
    await expect(picker).toBeVisible();

    const before = await content(page);
    await picker.getByRole('button', { name: 'Dark' }).click();
    await picker.getByRole('button', { name: 'Light' }).click();
    await picker.getByRole('button', { name: 'Dark' }).click();
    await expect.poll(() => content(page)).not.toBe(before);

    const nowDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(await content(page)).toBe(nowDark ? '#171717' : '#ffffff');
    expect(await count(page)).toBe(1);
  });

  test('it matches the page background it is meant to hide against', async ({
    page,
  }) => {
    await page.goto('/home');
    const [meta, bg] = await Promise.all([
      content(page),
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ]);
    const hex = (rgb: string) =>
      `#${(rgb.match(/\d+/g) ?? [])
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`;
    expect(meta).toBe(hex(bg));
  });
});
