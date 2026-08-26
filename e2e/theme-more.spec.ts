import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';

const seed = readSeed();
const picker = (p: Page) => p.getByRole('group', { name: 'Theme' });

const state = (p: Page) =>
  p.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    dark: document.documentElement.classList.contains('dark'),
    page: getComputedStyle(document.documentElement)
      .getPropertyValue('--page')
      .trim(),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

const eventColours = (p: Page) =>
  p.evaluate(() => {
    const read = (type: string) => {
      const el = document.createElement('div');
      el.setAttribute('data-event-type', type);
      document.body.appendChild(el);
      const v = getComputedStyle(el).getPropertyValue('--event-accent').trim();
      el.remove();
      return v;
    };
    return {
      base: read('none'),
      show: read('show'),
      practice: read('practice'),
      writing: read('writing'),
      studio: read('studio'),
      timeOff: read('time-off'),
    };
  });

async function pick(p: Page, name: string) {
  await p.goto('/settings');
  await p.getByRole('tab', { name: 'Appearance' }).click();
  await picker(p).getByRole('button', { name }).click();
}

test('both new themes are offered', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await expect(picker(page).getByRole('button')).toHaveCount(7);
  await expect(
    picker(page).getByRole('button', { name: "SynthWave '84" }),
  ).toBeVisible();
  await expect(
    picker(page).getByRole('button', { name: 'Catppuccin Latte' }),
  ).toBeVisible();
});

test("SynthWave '84 applies its palette and stays dark", async ({ page }) => {
  await pick(page, "SynthWave '84");
  const s = await state(page);
  expect(s.theme).toBe('synthwave-84');
  expect(s.dark).toBe(true);
  expect(s.scheme).toBe('dark');
  expect(s.page).toBe('#262335');
  expect(s.bodyBg).toBe('rgb(38, 35, 53)');
});

test('Catppuccin Latte is light: the dark class comes off', async ({
  page,
}) => {
  await pick(page, 'Catppuccin Latte');
  const s = await state(page);
  expect(s.theme).toBe('catppuccin-latte');
  // The one light theme besides the default — unmigrated `dark:` variants
  // must fall back to their light values here.
  expect(s.dark).toBe(false);
  expect(s.scheme).toBe('light');
  expect(s.page).toBe('#e6e9ef');
  expect(s.bodyBg).toBe('rgb(230, 233, 239)');
});

for (const [label, expected] of [
  [
    "SynthWave '84",
    {
      show: '#ff8b39',
      practice: '#36f9f6',
      writing: '#72f1b8',
      studio: '#b381c5',
      timeOff: '#ff7edb',
    },
  ],
  [
    'Catppuccin Latte',
    {
      show: '#fe640b',
      practice: '#1e66f5',
      writing: '#40a02b',
      studio: '#8839ef',
      timeOff: '#ea76cb',
    },
  ],
] as const) {
  test(`${label} re-tints calendar and todo colours, keeping them distinct`, async ({
    page,
  }) => {
    await pick(page, label);
    await page.goto(`/bands/${seed.bandId}?tab=todos`);
    const c = await eventColours(page);
    for (const [type, hex] of Object.entries(expected)) {
      expect(c[type as keyof typeof c], type).toBe(hex);
    }
    // The category coding only works if the hues stay apart.
    const hues = [c.show, c.practice, c.writing, c.studio, c.timeOff, c.base];
    expect(new Set(hues).size).toBe(6);
  });
}

test('Stage has its own warm category colours, not the dark set', async ({
  page,
}) => {
  await pick(page, 'Stage');
  await page.goto(`/bands/${seed.bandId}?tab=todos`);
  const c = await eventColours(page);

  // Not the dark defaults it used to inherit.
  expect(c.practice).not.toBe('#8aadf4');
  expect(c.writing).not.toBe('#a6da95');

  // Six categories, still six distinguishable hues.
  expect(new Set(Object.values(c)).size).toBe(6);

  // And every one warm: a blue-dominant channel is the light this theme
  // exists to avoid.
  for (const [role, hex] of Object.entries(c)) {
    // Indexed access on a destructured map is `number | undefined` under
    // noUncheckedIndexedAccess; read each channel directly instead.
    const ch = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    expect(
      ch(5),
      `${role} (${hex}) should not be blue-dominant`,
    ).toBeLessThanOrEqual(Math.max(ch(1), ch(3)));
  }
});

test('the picker survives a reload on a light custom theme', async ({
  page,
}) => {
  await pick(page, 'Catppuccin Latte');
  await page.reload();
  const s = await state(page);
  expect(s.theme).toBe('catppuccin-latte');
  expect(s.dark).toBe(false);
});
