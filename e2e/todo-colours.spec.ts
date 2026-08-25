import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { createTodo, setTodoStatus } from '../lib/db/todos';

const seed = readSeed();

/** Expected accents, read straight from globals.css (light theme). */
const LIGHT = {
  green: 'rgb(53, 115, 60)', // writing  #35733c
  blue: 'rgb(44, 95, 168)', // practice #2c5fa8
  purple: 'rgb(107, 71, 184)', // studio   #6b47b8
  grey: 'rgb(92, 100, 128)', // base     #5c6480
};

const ids: Record<string, string> = {};

test.beforeAll(async () => {
  const mk = async (key: string, title: string, shared: boolean) => {
    const t = await createTodo({
      bandId: seed.bandId,
      creatorId: seed.userId,
      title,
      description: null,
      shared,
      ownerId: shared ? seed.userId : null,
      deadline: null,
      links: [],
    });
    ids[key] = t.id;
    return t.id;
  };
  await mk('activeShared', 'E2E Colour Active Shared', true);
  await mk('activePrivate', 'E2E Colour Active Private', false);
  await setTodoStatus(
    await mk('complete', 'E2E Colour Complete', true),
    'complete',
  );
  await setTodoStatus(
    await mk('cancelled', 'E2E Colour Cancelled', true),
    'cancelled',
  );
});

/**
 * The tab opens on All (shared only) with Complete and Cancelled collapsed.
 * Mine is the scope that holds all four fixtures, since this user owns them.
 */
async function openAllSections(page: Page) {
  await page.goto(`/bands/${seed.bandId}?tab=todos`);
  await page
    .getByRole('group', { name: 'Todos' })
    .getByRole('button', { name: 'Mine' })
    .click();
  for (const s of ['Complete', 'Cancelled']) {
    const t = page.getByRole('button', { name: `Expand ${s} todos` });
    if (await t.count()) await t.first().click();
  }
}

/**
 * Everything about one row, read from the DOM in a single pass so the
 * assertions can't disagree about which element they're looking at.
 */
async function rowStyle(page: Page, title: string) {
  await page.getByText(title, { exact: true }).first().waitFor();
  return page.evaluate((t) => {
    const li = [...document.querySelectorAll('li')].find((e) =>
      e.textContent?.includes(t),
    );
    if (!li) throw new Error(`no row for ${t}`);
    const cs = getComputedStyle(li);
    // The leaf, not the wrapper: on a private row the wrapper holds only the
    // title too (no "Shared" pill), so matching on text alone finds the
    // uncoloured parent first.
    const title = [...li.querySelectorAll('span')].find(
      (x) => x.children.length === 0 && x.textContent?.trim() === t,
    );
    return {
      accent: cs.getPropertyValue('--event-accent').trim(),
      border: cs.borderLeftColor,
      borderWidth: cs.borderLeftWidth,
      titleColor: title ? getComputedStyle(title).color : null,
    };
  }, title);
}

test('each state takes its calendar colour, on the rule and the title', async ({
  page,
}) => {
  await openAllSections(page);

  for (const [title, hex, rgb] of [
    ['E2E Colour Active Shared', '#2c5fa8', LIGHT.blue],
    ['E2E Colour Active Private', '#6b47b8', LIGHT.purple],
    ['E2E Colour Complete', '#35733c', LIGHT.green],
    ['E2E Colour Cancelled', '#5c6480', LIGHT.grey],
  ] as const) {
    const s = await rowStyle(page, title);
    expect(s.accent, `${title} accent`).toBe(hex);
    expect(s.border, `${title} left rule`).toBe(rgb);
    expect(s.borderWidth, `${title} rule width`).toBe('3px');
    expect(s.titleColor, `${title} title`).toBe(rgb);
  }
});

test('the detail page matches the row it came from', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/todos/${ids.complete}`);
  const head = page.locator('[data-event-type]').first();
  await expect(head).toHaveCSS('border-left-color', LIGHT.green);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS(
    'color',
    LIGHT.green,
  );
});
