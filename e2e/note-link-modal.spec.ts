import { test, expect, type Page } from '@playwright/test';
import { readSeed, E2E } from './fixtures';

const seed = readSeed();

/**
 * Everything is scoped to the dialog.
 *
 * Both the note and todo forms have a Save of their own, and the todo form's
 * link trigger is itself called "Add link" — but the picker is `role="dialog"`
 * with `aria-modal`, so while it's open those are out of reach for a screen
 * reader too. Querying inside it is what a user of this thing actually sees.
 */
const picker = (p: Page) =>
  p.getByRole('dialog', { name: 'Link to something' });
const save = (p: Page) => picker(p).getByRole('button', { name: 'Save' });
const songRow = (p: Page) =>
  picker(p)
    .getByRole('button', { name: new RegExp(E2E.songName) })
    .first();

/** "Type" is the app's own combobox, driven by clicks, not selectOption. */
async function chooseType(p: Page, label: string) {
  await picker(p).getByRole('combobox').click();
  await p.getByRole('option', { name: label, exact: true }).click();
}

async function openPicker(p: Page, from: 'note' | 'todo') {
  await p.goto(`/bands/${seed.bandId}/${from}s/new`);
  await p
    .getByRole('button', { name: from === 'note' ? 'New link' : 'Add link' })
    .click();
  await expect(picker(p)).toBeVisible();
}

test.describe('link picker', () => {
  test('choosing a row selects it and leaves the picker open', async ({
    page,
  }) => {
    await openPicker(page, 'note');
    await expect(save(page)).toBeDisabled();

    await songRow(page).click();

    await expect(picker(page)).toBeVisible();
    await expect(songRow(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(save(page)).toBeEnabled();
  });

  test('Save commits the choice and closes', async ({ page }) => {
    await openPicker(page, 'note');
    await songRow(page).click();
    await save(page).click();

    await expect(picker(page)).toBeHidden();
    await expect(page.getByText(E2E.songName).first()).toBeVisible();
  });

  test('changing the type drops a stale choice', async ({ page }) => {
    await openPicker(page, 'note');
    await songRow(page).click();
    await expect(save(page)).toBeEnabled();

    await chooseType(page, 'Event');
    await expect(save(page)).toBeDisabled();
  });

  test('a plain URL commits from its own field', async ({ page }) => {
    await openPicker(page, 'note');
    await chooseType(page, 'Other');
    await expect(save(page)).toBeDisabled();

    await picker(page)
      .getByLabel('Link or reference')
      .fill('https://example.test/x');
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(picker(page)).toBeHidden();
  });

  test('the same picker behaves the same from a todo', async ({ page }) => {
    await openPicker(page, 'todo');
    await expect(save(page)).toBeDisabled();
    await songRow(page).click();
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(picker(page)).toBeHidden();
  });
});
