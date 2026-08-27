import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { createNote, listBandNotesForUser } from '../lib/db/user-notes';

const seed = readSeed();
const NOTE = 'E2E Save Without Closing';
let noteId = '';

test.beforeAll(async () => {
  const existing = (await listBandNotesForUser(seed.bandId, seed.userId)).find(
    (n) => n.title === NOTE,
  );
  noteId =
    existing?.id ??
    (
      await createNote({
        bandId: seed.bandId,
        authorId: seed.userId,
        title: NOTE,
        body: 'first',
        shared: false,
        links: [],
      })
    ).id;
});

const editUrl = () => `/bands/${seed.bandId}/notes/${noteId}/edit`;
/** The note's body. By id: its visible label is "Note". */
const body = (p: Page) => p.locator('#note-body');

test('saving without closing keeps the page and persists', async ({ page }) => {
  await page.goto(editUrl());
  const stamp = `kept open ${Date.now()}`;
  await body(page).fill(stamp);

  await page.getByRole('button', { name: 'Save without closing' }).click();
  await expect(page.getByText('Note saved.')).toBeVisible();

  // Still on the editor.
  await expect(page).toHaveURL(new RegExp(`/notes/${noteId}/edit$`));
  await expect(page.getByRole('heading', { name: 'Edit note' })).toBeVisible();

  // And it really reached the server.
  await page.reload();
  await expect(body(page)).toHaveValue(stamp);
});

test('it can be saved repeatedly without leaving', async ({ page }) => {
  await page.goto(editUrl());
  const save = page.getByRole('button', { name: 'Save without closing' });

  for (const text of ['one', 'two', 'three']) {
    await body(page).fill(text);
    /*
     * Wait on the save itself rather than the toast. Toasts stack and linger
     * for five seconds, so `getByText('Note saved.')` matches every one still
     * on screen — it either trips strict mode on two of them, or is satisfied
     * by the *previous* save's toast and lets the loop reload the page while
     * this save is still in flight. The first test in this file already
     * covers that the toast appears.
     */
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/bands/${seed.bandId}/notes/${noteId}`) &&
        r.request().method() === 'PATCH' &&
        r.ok(),
    );
    await save.click();
    await saved;
    await expect(page).toHaveURL(new RegExp(`/notes/${noteId}/edit$`));
  }

  await page.reload();
  await expect(body(page)).toHaveValue('three');
});

test('plain Save still closes', async ({ page }) => {
  await page.goto(editUrl());
  await body(page).fill('closing now');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp('/edit$'));
});

test('a new note does not offer it', async ({ page }) => {
  await page.goto(`/bands/${seed.bandId}/notes/new`);
  await expect(
    page.getByRole('button', { name: 'Save without closing' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeVisible();
});
