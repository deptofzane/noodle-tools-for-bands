import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { createSetlist } from '../lib/db/setlists';

const seed = readSeed();
const SET = 'E2E Header Set';
let setlistId = '';

test.beforeAll(async () => {
  const { listBandSetlists } = await import('../lib/db/setlists');
  const existing = (await listBandSetlists(seed.bandId)).find(
    (s) => s.name === SET,
  );
  setlistId =
    existing?.id ??
    (
      await createSetlist({
        bandId: seed.bandId,
        createdBy: seed.userId,
        name: SET,
        items: [{ conversationId: seed.songId, label: null }],
      })
    ).id;
});

const origin = (p: Page) => new URL(p.url()).origin;

test.describe('practice header', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('Edit is a pencil and Share is a chain', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);

    const edit = page.getByRole('link', { name: 'Edit song' });
    await expect(edit).toBeVisible();
    // A glyph now, not the words.
    await expect(edit).toHaveText('');
    await expect(edit.locator('svg')).toHaveCount(1);

    await expect(
      page.getByRole('button', { name: 'Copy a link to this song' }),
    ).toBeVisible();
    /*
     * The worded control it replaced is gone — scoped to the header, because
     * every note thread in the panel below carries a "Copy link" of its own,
     * and this song accumulates notes as other specs post them. Unscoped,
     * this passes or fails depending on which specs ran first.
     */
    await expect(
      page.locator('header').getByRole('button', { name: 'Copy link' }),
    ).toHaveCount(0);
  });

  test('the pencil still opens the editor', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    await page.getByRole('link', { name: 'Edit song' }).click();
    await expect(page).toHaveURL(`/notes/${seed.songId}/edit`);
  });

  test('the chain copies the song link on a single song', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    await page
      .getByRole('button', { name: 'Copy a link to this song' })
      .click();
    await expect(page.getByText('Song link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${origin(page)}/notes/${seed.songId}/practice`,
    );
  });

  test('the chain copies the set link when practising a setlist', async ({
    page,
  }) => {
    await page.goto(`/practice?setlist=${setlistId}`);
    await page.getByRole('button', { name: 'Copy a link to this set' }).click();
    await expect(page.getByText('Setlist link copied.')).toBeVisible();
    // Carries the position, so it opens on the song that was showing.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `setlist=${setlistId}`,
    );
  });
});
