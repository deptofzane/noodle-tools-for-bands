import '../scripts/load-env';
import { Readable } from 'node:stream';
import { test, expect, type Page } from '@playwright/test';
import { readSeed } from './fixtures';
import { addAudioVersion, deleteAudioVersion } from '../lib/db/song-files';
import { createNote, deleteNote } from '../lib/db/notes';

/**
 * The Practice player's start/stop section, on the phone layout.
 *
 * The seeded audio is dummy bytes, so every audio request is answered with a
 * 20-second silent WAV — enough for the player to load, report a length and
 * play in real time. Where the playhead is gets read off the Seek slider.
 */
const seed = readSeed();
// Page routes don't see requests a service worker makes.
test.use({ serviceWorkers: 'block' });

const LENGTH = 20;
let secondVersionId = '';
let noteId = '';

test.beforeAll(async () => {
  // A second version to switch to, and a note far past the sections below.
  const bytes = Buffer.alloc(64 * 1024, 7);
  secondVersionId = (
    await addAudioVersion({
      conversationId: seed.songId,
      body: Readable.from(bytes),
      sizeBytes: bytes.length,
      fileName: 'e2e-take-2.mp3',
      mimeType: 'audio/mpeg',
    })
  ).id;
  noteId = (await createNote(seed.songId, seed.userId, 15_000, 'E2E late note'))
    .id;
});

test.afterAll(async () => {
  if (noteId) await deleteNote(seed.songId, seed.userId, noteId);
  if (secondVersionId) await deleteAudioVersion(seed.songId, secondVersionId);
});

function silentWav(seconds: number, rate = 8000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf;
}

const checkbox = (p: Page) =>
  p.getByRole('checkbox', { name: 'Customize start and stop' });
const startField = (p: Page) =>
  p.getByRole('textbox', { name: 'Section start time' });
const stopField = (p: Page) =>
  p.getByRole('textbox', { name: 'Section stop time' });
const startSlider = (p: Page) => p.getByRole('slider', { name: 'Section start' });
const stopSlider = (p: Page) => p.getByRole('slider', { name: 'Section stop' });
const repeat = (p: Page) => p.getByRole('button', { name: 'Repeat' });
const playhead = async (p: Page) =>
  Number(await p.getByRole('slider', { name: 'Seek' }).inputValue());
/** The playhead settles near `t` — seeks report back asynchronously. */
const expectAt = (p: Page, t: number) =>
  expect.poll(() => playhead(p), { timeout: 2_000 }).toBeCloseTo(t, 1);

test.beforeEach(async ({ page }) => {
  const wav = silentWav(LENGTH);
  // Answered with byte ranges, as the real serve route does: the browser
  // won't seek in audio it can't fetch a range of, and snaps back to 0.
  await page.route(/\/files\/audio/, (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(
      route.request().headers()['range'] ?? '',
    );
    if (!range) {
      return route.fulfill({
        status: 200,
        headers: { 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/wav' },
        body: wav,
      });
    }
    const from = Number(range[1]);
    const to = range[2] ? Number(range[2]) : wav.length - 1;
    return route.fulfill({
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Type': 'audio/wav',
        'Content-Range': `bytes ${from}-${to}/${wav.length}`,
      },
      body: wav.subarray(from, to + 1),
    });
  });
});

/** Open the song with its options panel showing and the audio loaded. */
async function open(page: Page) {
  await page.goto(`/notes/${seed.songId}/practice`);
  const toggle = page.getByRole('button', { name: 'Playback options' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(checkbox(page)).toBeEnabled({ timeout: 15_000 });
}

async function type(field: ReturnType<typeof startField>, value: string) {
  await field.fill(value);
  await field.press('Enter');
}

/** Turn the section on and set it by typing. */
async function section(page: Page, start: string, stop: string) {
  await checkbox(page).check();
  // Stop first, so a start later than the default stop isn't clamped by it.
  await type(stopField(page), stop);
  await type(startField(page), start);
}

test('the section controls appear only when the box is checked, spanning the song', async ({
  page,
}) => {
  await open(page);
  await expect(startField(page)).toHaveCount(0);

  await checkbox(page).check();
  await expect(startField(page)).toHaveValue('0:00.00');
  await expect(stopField(page)).toHaveValue('0:20.00');
  await expect(repeat(page)).toHaveAttribute('aria-pressed', 'false');

  await checkbox(page).uncheck();
  await expect(startField(page)).toHaveCount(0);
});

test('with the options closed, a note says a section is on', async ({
  page,
}) => {
  const note = page.getByText('Custom start and stop time is enabled.');
  const toggle = page.getByRole('button', { name: 'Playback options' });
  await open(page);
  await toggle.click();
  await expect(note).toHaveCount(0);

  await toggle.click();
  await checkbox(page).check();
  await expect(note).toHaveCount(0);
  await toggle.click();
  await expect(note).toBeVisible();

  await toggle.click();
  await checkbox(page).uncheck();
  await toggle.click();
  await expect(note).toHaveCount(0);
});

test('the slider and the fields follow each other', async ({ page }) => {
  await open(page);
  await checkbox(page).check();

  await type(startField(page), '4.5');
  await expect(startSlider(page)).toHaveValue('4.5');
  await type(stopField(page), '0:12.25');
  await expect(stopSlider(page)).toHaveValue('12.25');

  await startSlider(page).fill('6');
  await expect(startField(page)).toHaveValue('0:06.00');
  await stopSlider(page).fill('15.5');
  await expect(stopField(page)).toHaveValue('0:15.50');

  // Junk keeps what was there.
  await type(startField(page), 'soon');
  await expect(startField(page)).toHaveValue('0:06.00');
});

test('the ends stay at least a second apart and inside the song', async ({
  page,
}) => {
  await open(page);
  await section(page, '5', '10');

  await type(startField(page), '9.8');
  await expect(startField(page)).toHaveValue('0:09.00');
  await type(stopField(page), '3');
  await expect(stopField(page)).toHaveValue('0:10.00');
  await stopSlider(page).fill('2');
  await expect(stopField(page)).toHaveValue('0:10.00');
  await type(stopField(page), '99');
  await expect(stopField(page)).toHaveValue('0:20.00');
});

test('without repeat, playback stops at the stop point and waits at the start', async ({
  page,
}) => {
  await open(page);
  await section(page, '1', '2.5');
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();
  const began = Date.now();

  // The page has other Play buttons (the playlist player's); this player's
  // Pause is the only one, so its going away is the stop.
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0, {
    timeout: 5_000,
  });
  // It played the section through rather than stopping at once.
  expect(Date.now() - began).toBeGreaterThan(1_000);
  await expectAt(page, 1);
});

test('with repeat, the section loops', async ({ page }) => {
  await open(page);
  await section(page, '1', '2.5');
  await repeat(page).click();
  await expect(repeat(page)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play' }).first().click();

  // Well past one pass through the section, and still going — inside it.
  await page.waitForTimeout(4_000);
  await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();
  const t = await playhead(page);
  expect(t).toBeGreaterThanOrEqual(1);
  expect(t).toBeLessThan(2.6);
});

test('a section at the very end of the song still loops', async ({ page }) => {
  await open(page);
  await section(page, '18', '20');
  await repeat(page).click();
  await page.getByRole('button', { name: 'Play' }).first().click();

  await page.waitForTimeout(3_500);
  await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();
  expect(await playhead(page)).toBeGreaterThanOrEqual(18);
});

test('seeks stay inside the section; past it means its start', async ({
  page,
}) => {
  await open(page);
  // Somewhere the section will exclude, so turning it on has to move it.
  await page.getByRole('slider', { name: 'Seek' }).fill('15');
  await section(page, '5', '10');
  await expectAt(page, 5);

  const seek = page.getByRole('slider', { name: 'Seek' });
  await seek.fill('2');
  await expectAt(page, 5);
  await seek.fill('9');
  await expectAt(page, 9);

  await page.getByRole('button', { name: 'Forward 10 seconds' }).click();
  await expectAt(page, 5);

  await seek.fill('9');
  await page.getByRole('button', { name: 'Back 10 seconds' }).click();
  await expectAt(page, 5);

  await seek.fill('9');
  await page.getByRole('button', { name: 'Start over' }).click();
  await expectAt(page, 5);

  // A note's timestamp (0:15) goes through the same clamp.
  await seek.fill('9');
  await page.getByTitle('Jump to this timestamp').first().click();
  await expectAt(page, 5);
});

test('play always starts from the section’s start, not where it paused', async ({
  page,
}) => {
  await open(page);
  await section(page, '5', '15');

  // Paused partway through…
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Pause' }).click();
  expect(await playhead(page)).toBeGreaterThan(6);

  // …and moved inside the section: play still starts over from the start.
  await page.getByRole('slider', { name: 'Seek' }).fill('12');
  await page.waitForTimeout(150); // the player ignores toggles <100ms apart
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect
    .poll(() => playhead(page), { timeout: 1_000 })
    .toBeLessThan(6);
});

test('the section is remembered, and unchecking keeps it for next time', async ({
  page,
}) => {
  await open(page);
  await section(page, '3', '8');
  await repeat(page).click();

  await page.reload();
  await open(page);
  await expect(checkbox(page)).toBeChecked();
  await expect(startField(page)).toHaveValue('0:03.00');
  await expect(stopField(page)).toHaveValue('0:08.00');
  await expect(repeat(page)).toHaveAttribute('aria-pressed', 'true');

  await checkbox(page).uncheck();
  await page.reload();
  await open(page);
  await expect(checkbox(page)).not.toBeChecked();
  await checkbox(page).check();
  await expect(startField(page)).toHaveValue('0:03.00');
  await expect(stopField(page)).toHaveValue('0:08.00');
});

test('each version keeps its own section; a new one spans the song', async ({
  page,
}) => {
  await open(page);
  await section(page, '3', '8');

  const version = page.getByRole('combobox', { name: 'Audio version' });
  await version.selectOption({ label: 'e2e-take-2.mp3' });
  await expect(checkbox(page)).toBeEnabled({ timeout: 15_000 });
  await expect(checkbox(page)).not.toBeChecked();
  await checkbox(page).check();
  await expect(startField(page)).toHaveValue('0:00.00');
  await expect(stopField(page)).toHaveValue('0:20.00');
  await type(startField(page), '11');

  await version.selectOption({ label: 'e2e-take-1.mp3 (default)' });
  await expect(checkbox(page)).toBeEnabled({ timeout: 15_000 });
  await expect(checkbox(page)).toBeChecked();
  await expect(startField(page)).toHaveValue('0:03.00');
  await expect(stopField(page)).toHaveValue('0:08.00');
});

test('on desktop, where there are no controls for it yet, a section isn’t applied', async ({
  page,
}) => {
  await open(page);
  await section(page, '5', '10');

  // The player swaps to the rail when the viewport becomes desktop-sized.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(checkbox(page)).toHaveCount(0);
  await page.getByRole('slider', { name: 'Seek' }).fill('15');
  await expectAt(page, 15);
});
