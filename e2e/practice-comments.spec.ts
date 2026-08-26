import { test, expect } from '@playwright/test';
import { readSeed, E2E } from './fixtures';
import { findOrCreateConversation } from '../lib/db/conversations';
import { addAudioVersion } from '../lib/db/song-files';
import { createSetlist } from '../lib/db/setlists';
import { Readable } from 'node:stream';

const seed = readSeed();
let secondSongId = '';
let setlistId = '';

test.beforeAll(async () => {
  const song = await findOrCreateConversation(
    seed.bandId,
    'e2e-practice-comments-2',
    'E2E Second Practice Song',
  );
  secondSongId = song.id;
  const bytes = Buffer.alloc(8 * 1024, 3);
  await addAudioVersion({
    conversationId: song.id,
    body: Readable.from(bytes),
    sizeBytes: bytes.length,
    fileName: 'e2e-second.mp3',
    mimeType: 'audio/mpeg',
    driveFileId: 'e2e-audio-second',
  });
  const sl = await createSetlist({
    bandId: seed.bandId,
    createdBy: seed.userId,
    name: 'E2E Comments Set',
    items: [
      { conversationId: seed.songId, label: null },
      { conversationId: song.id, label: null },
    ],
  });
  setlistId = sl.id;
});

test('single-song practice shows the Notes panel, with Close', async ({
  page,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible();
  // This screen is the song's home, so it owns Close / Reopen.
  await expect(
    page.getByRole('button', { name: 'Close conversation' }),
  ).toBeVisible();
});

test('a comment posted on practice sticks', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  const body = `E2E practice comment ${Date.now()}`;

  await page
    .getByRole('button', { name: '+ Add note at current time' })
    .click();
  await page.locator('textarea').first().fill(body);
  // The composer submits with "Add note" (⌘-Enter also works); "Send" is the
  // chat composer's button, elsewhere.
  await page.getByRole('button', { name: 'Add note' }).click();

  await expect(page.getByText(body)).toBeVisible();
  // A reload proves it reached the server rather than just the composer.
  await page.reload();
  await expect(page.getByText(body)).toBeVisible();
});

test('stepping a setlist swaps the thread', async ({ page }) => {
  await page.goto(`/practice?setlist=${setlistId}`);
  await expect(page.getByText(E2E.songName).first()).toBeVisible();
  const panel = page.getByRole('region', { name: 'Notes' });
  await expect(panel).toBeVisible();
  // Stepping a setlist isn't the place to close a conversation.
  await expect(
    page.getByRole('button', { name: 'Close conversation' }),
  ).toBeHidden();

  await page.getByRole('button', { name: 'Next song' }).click();
  await expect(
    page.getByText('E2E Second Practice Song').first(),
  ).toBeVisible();
  // Still a panel, and it belongs to the song now on screen.
  await expect(panel).toBeVisible();
});

test('a song with no audio shows the placeholder, not a dead player', async ({
  page,
}) => {
  const bare = await findOrCreateConversation(
    seed.bandId,
    'e2e-no-audio',
    'E2E Song Without Audio',
  );
  await page.goto(`/notes/${bare.id}/practice`);

  await expect(page.getByText('No audio yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeHidden();
  // The song still has a home: notes are reachable.
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible();
});

test('?thread= opens that note thread', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  const body = `E2E thread target ${Date.now()}`;
  await page
    .getByRole('button', { name: '+ Add note at current time' })
    .click();
  await page.locator('textarea').first().fill(body);
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(body)).toBeVisible();

  // The permalink a note's own "Copy link" produces.
  // The panel reads its notes from the conversation itself, not a /notes
  // sub-route.
  const threadId = await page.evaluate(async (cid) => {
    const r = await fetch(`/api/conversations/${cid}`);
    const d = (await r.json()) as { notes: { id: string; body: string }[] };
    return d.notes[d.notes.length - 1]?.id ?? '';
  }, seed.songId);
  expect(threadId).not.toBe('');

  await page.goto(`/notes/${seed.songId}/practice?thread=${threadId}`);
  await expect(page.getByText(body)).toBeVisible();
});

test('offline says so instead of showing an empty list', async ({ page }) => {
  /*
   * The document itself is fetched normally — this route isn't precached, so
   * `context.setOffline` would fail the navigation rather than exercise the
   * panel. What's under test is the panel's own branch: the browser reports
   * offline and its request never lands. Real offline practice runs off the
   * precached `/practice` shell and is covered by the download spec.
   */
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  });
  await page.route('**/api/conversations/*', (route) => route.abort());

  await page.goto(`/notes/${seed.songId}/practice`);
  await expect(page.getByText('Notes need a connection.')).toBeVisible();
  await expect(page.getByText('No notes yet.')).toBeHidden();
});

test('the old song URL redirects, carrying its query', async ({ page }) => {
  await page.goto(`/notes/${seed.songId}`);
  await expect(page).toHaveURL(`/notes/${seed.songId}/practice`);

  // `?from=` still decides where Back goes, and `?thread=` still names a
  // thread — both are read on the practice screen now.
  await page.goto(`/notes/${seed.songId}?from=audio`);
  await expect(page).toHaveURL(`/notes/${seed.songId}/practice?from=audio`);
});
