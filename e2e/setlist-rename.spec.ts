import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { createSetlist, listBandSetlists } from '../lib/db/setlists';

const seed = readSeed();
const BASE = 'E2E Rename Setlist';
const RENAMED = 'E2E Rename Setlist (changed)';
let setlistId = '';

/**
 * Its own setlist, not the seeded one: renaming that would break every other
 * spec that looks it up by name. Found under either name, so a run that ends
 * mid-rename doesn't create a second.
 */
test.beforeAll(async () => {
  const all = await listBandSetlists(seed.bandId);
  const existing = all.find((s) => s.name === BASE || s.name === RENAMED);
  setlistId =
    existing?.id ??
    (
      await createSetlist({
        bandId: seed.bandId,
        createdBy: seed.userId,
        name: BASE,
        items: [{ conversationId: seed.songId, label: null }],
      })
    ).id;
});

const editUrl = () => `/bands/${seed.bandId}/setlists/${setlistId}/edit`;
const nameField = (p: Page) => p.locator('#setlist-name');
const saveBtn = (p: Page) => p.getByRole('button', { name: 'Save' }).first();

test('the name is an editable field holding the current name', async ({
  page,
}) => {
  await page.goto(editUrl());
  await expect(nameField(page)).toBeVisible();
  await expect(nameField(page)).toHaveValue(/E2E Rename Setlist/);
  // Nothing changed yet.
  await expect(saveBtn(page)).toBeDisabled();
});

test('an empty name blocks saving and says why', async ({ page }) => {
  await page.goto(editUrl());
  await nameField(page).fill('   ');
  await expect(page.getByText('A setlist needs a name.')).toBeVisible();
  await expect(saveBtn(page)).toBeDisabled();
});

test('renaming persists, and can be renamed back', async ({ page }) => {
  await page.goto(editUrl());
  const start = await nameField(page).inputValue();
  const target = start === BASE ? RENAMED : BASE;

  await nameField(page).fill(target);
  await expect(saveBtn(page)).toBeEnabled();
  await saveBtn(page).click();
  await expect(page.getByText('Setlist saved.')).toBeVisible();

  // The setlist's own page shows it.
  await page.goto(`/bands/${seed.bandId}/setlists/${setlistId}`);
  await expect(page.getByText(target).first()).toBeVisible();

  // And back again, so the fixture is where it started.
  await page.goto(editUrl());
  await nameField(page).fill(start);
  await saveBtn(page).click();
  await expect(page.getByText('Setlist saved.')).toBeVisible();
  await page.goto(editUrl());
  await expect(nameField(page)).toHaveValue(start);
});
