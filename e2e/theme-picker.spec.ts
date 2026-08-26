import { test, expect, type Page } from '@playwright/test';

const picker = (p: Page) => p.getByRole('group', { name: 'Theme' });
const meta = (p: Page) =>
  p.locator('meta[name="theme-color"]').getAttribute('content');
const applied = (p: Page) =>
  p.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    dark: document.documentElement.classList.contains('dark'),
    page: getComputedStyle(document.documentElement)
      .getPropertyValue('--page')
      .trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

async function openAppearance(p: Page) {
  await p.goto('/settings');
  await p.getByRole('tab', { name: 'Appearance' }).click();
  await expect(picker(p)).toBeVisible();
}

test('the picker offers sepia', async ({ page }) => {
  await openAppearance(page);
  await expect(
    picker(page).getByRole('button', { name: 'Sepia' }),
  ).toBeVisible();
});

test('choosing sepia applies it everywhere it matters', async ({ page }) => {
  await openAppearance(page);
  await picker(page).getByRole('button', { name: 'Sepia' }).click();

  const s = await applied(page);
  expect(s.theme).toBe('sepia');
  // Low light, so the dark class stays on: the variants still awaiting
  // migration must not render their light values against a dark page.
  expect(s.dark).toBe(true);
  expect(s.page).toBe('#1c1714');
  expect(s.bodyBg).toBe('rgb(28, 23, 20)');
  expect(await meta(page)).toBe('#1c1714');
});

test('it survives a reload, before paint', async ({ page }) => {
  await openAppearance(page);
  await picker(page).getByRole('button', { name: 'Sepia' }).click();
  await page.reload();

  const s = await applied(page);
  expect(s.theme).toBe('sepia');
  expect(s.dark).toBe(true);
  expect(await meta(page)).toBe('#1c1714');
});

test('sepia repaints the app, not just the settings page', async ({ page }) => {
  await openAppearance(page);
  await picker(page).getByRole('button', { name: 'Sepia' }).click();
  await page.goto('/home');
  expect((await applied(page)).bodyBg).toBe('rgb(28, 23, 20)');
});

test('switching back to light drops the dark class', async ({ page }) => {
  await openAppearance(page);
  await picker(page).getByRole('button', { name: 'Sepia' }).click();
  await picker(page).getByRole('button', { name: 'Light' }).click();

  const s = await applied(page);
  expect(s.theme).toBe('light');
  expect(s.dark).toBe(false);
  expect(await meta(page)).toBe('#ffffff');
});

test('charts stay out of it', async ({ page }) => {
  // `.sheet-prose` is deliberately outside the token system — a theme must
  // never make sheet music harder to read.
  await openAppearance(page);
  await picker(page).getByRole('button', { name: 'Sepia' }).click();
  const usesTokens = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some(
          (r) =>
            (r as CSSStyleRule).selectorText?.includes('sheet-prose') &&
            /var\(--(fg|page|surface|line)/.test(
              (r as CSSStyleRule).style?.cssText ?? '',
            ),
        );
      } catch {
        return false;
      }
    }),
  );
  expect(usesTokens).toBe(false);
});
