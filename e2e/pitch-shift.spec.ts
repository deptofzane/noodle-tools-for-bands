import { test, expect, devices, type Page } from '@playwright/test';
import { readSeed } from './fixtures';

/**
 * Does the real player, fed a real 440 Hz tone, come out shifted?
 *
 * The seeded audio is dummy bytes, so the audio request is answered with a
 * generated WAV; everything after that is the app's own Howler → Web Audio →
 * worklet path. What reaches the speakers is read back through an analyser
 * spliced in front of each context's destination.
 */
const seed = readSeed();
test.use({
  viewport: { width: 1280, height: 900 },
  isMobile: false,
  // Page routes don't see requests a service worker makes.
  serviceWorkers: 'block',
});

type Tapped = { __analysers: Map<BaseAudioContext, AnalyserNode> };

/** 440 · 2^(2/12) */
const UP_TWO = [488, 500] as const;
const A440 = [435, 445] as const;

function toneWav(hz: number, seconds: number, rate = 44100): Buffer {
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
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * hz * i) / rate) * 0.5;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * The loudest frequency reaching the speakers, or 0 for silence.
 *
 * Suspended contexts are skipped: their analysers hold whatever they last
 * heard, which would read as sound that isn't playing.
 */
async function peakHz(page: Page): Promise<number> {
  await page.waitForTimeout(1500); // let the shifter's latency pass
  return page.evaluate(() => {
    let loudest = { hz: 0, db: -Infinity };
    for (const a of (window as unknown as Tapped).__analysers.values()) {
      if (a.context.state !== 'running') continue;
      const bins = new Float32Array(a.frequencyBinCount);
      a.getFloatFrequencyData(bins);
      let best = 1;
      for (let i = 1; i < bins.length; i++) if (bins[i]! > bins[best]!) best = i;
      if (bins[best]! > loudest.db) {
        loudest = {
          hz: (best * a.context.sampleRate) / a.fftSize,
          db: bins[best]!,
        };
      }
    }
    return loudest.db > -100 ? loudest.hz : 0;
  });
}

const field = (p: Page) => p.getByRole('spinbutton', { name: /^Pitch/ });
const up = (p: Page) => p.getByRole('button', { name: 'Pitch up a half-step' });
const down = (p: Page) =>
  p.getByRole('button', { name: 'Pitch down a half-step' });

/** Open the song and start the tone playing. */
async function playing(page: Page) {
  await page.goto(`/notes/${seed.songId}/practice`);
  await expect(up(page)).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Play' }).first().click();
}

async function expectHz(page: Page, [lo, hi]: readonly [number, number]) {
  const hz = await peakHz(page);
  expect(hz).toBeGreaterThan(lo);
  expect(hz).toBeLessThan(hi);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const analysers = new Map<BaseAudioContext, AnalyserNode>();
    (window as unknown as Tapped).__analysers = analysers;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      dest: AudioNode | AudioParam,
      ...rest: number[]
    ) {
      if (dest instanceof AudioDestinationNode) {
        let a = analysers.get(dest.context);
        if (!a) {
          a = dest.context.createAnalyser();
          a.fftSize = 32768;
          // Each reading fresh: with smoothing, a tone that has stopped
          // lingers in the next read as if still playing.
          a.smoothingTimeConstant = 0;
          analysers.set(dest.context, a);
        }
        (connect as (d: AudioNode) => AudioNode).call(this, a);
      }
      return (connect as (...a: unknown[]) => AudioNode).call(
        this,
        dest,
        ...rest,
      );
    } as typeof AudioNode.prototype.connect;
  });
  const wav = toneWav(440, 30);
  await page.route(/\/files\/audio/, (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }),
  );
});

test('pitch starts at 0 and shifts a playing tone, alone and with speed', async ({
  page,
}) => {
  await playing(page);
  await expect(field(page)).toHaveValue('0');

  await up(page).click();
  await up(page).click();
  await expect(field(page)).toHaveValue('2');
  await expectHz(page, UP_TWO);

  await down(page).click();
  await down(page).click();
  await expectHz(page, A440);

  // Typed, and at 75% speed: the element keeps the pitch through the speed
  // change, and the shift applies on top.
  await field(page).fill('2');
  await field(page).press('Enter');
  const speed = page.getByRole('spinbutton', { name: /Playback speed/ });
  await speed.fill('75');
  await speed.press('Enter');
  await expectHz(page, UP_TWO);
});

test('the arrows stop at an octave either way', async ({ page }) => {
  await playing(page);
  await field(page).fill('12');
  await field(page).press('Enter');
  await expect(up(page)).toBeDisabled();
  await field(page).fill('-40');
  await field(page).press('Enter');
  await expect(field(page)).toHaveValue('-12');
  await expect(down(page)).toBeDisabled();
});

test('pressing play wakes a context the OS suspended', async ({ page }) => {
  await playing(page);
  await up(page).click();
  await up(page).click();
  await expectHz(page, UP_TWO);

  // What a phone call or a screen lock does.
  await page.evaluate(async () => {
    for (const ctx of (window as unknown as Tapped).__analysers.keys()) {
      if (ctx instanceof AudioContext) await ctx.suspend();
    }
  });
  expect(await peakHz(page)).toBe(0);

  await page.getByRole('button', { name: 'Pause' }).first().click();
  await page.waitForTimeout(150); // the player ignores toggles <100ms apart
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expectHz(page, UP_TWO);
});

test('leaving stops the sound; coming back keeps the song\'s pitch', async ({
  page,
}) => {
  await playing(page);
  await up(page).click();
  await up(page).click();
  await expectHz(page, UP_TWO);

  // Client-side navigation, so the page — and Howler's element pool — lives on.
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.endsWith('/practice'));
  expect(await peakHz(page)).toBe(0);

  // Remembered for this song. Applied on load, outside any tap, so the
  // context starts suspended — the play tap is what brings the sound in.
  await page.goBack();
  await expect(up(page)).toBeEnabled({ timeout: 15_000 });
  await expect(field(page)).toHaveValue('2');
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expectHz(page, UP_TWO);

  // The pool may have handed the new engine the already-attached element;
  // back at 0 it must still be heard, unshifted.
  await down(page).click();
  await down(page).click();
  await expectHz(page, A440);
});

test('where pitch can\'t shift, it says so and the song still plays', async ({
  page,
}) => {
  await page.addInitScript(() => {
    AudioWorklet.prototype.addModule = () =>
      Promise.reject(new Error('no worklets here'));
  });
  await playing(page);
  await up(page).click();

  await expect(page.getByText('Not supported on this device')).toBeVisible();
  await expect(field(page)).toHaveCount(0);
  await expectHz(page, A440);
});

test.describe('phone', () => {
  const { viewport, isMobile, hasTouch } = devices['Pixel 7'];
  test.use({ viewport, isMobile, hasTouch });

  test('pitch down sits left of the field, pitch up right', async ({ page }) => {
    await page.goto(`/notes/${seed.songId}/practice`);
    const toggle = page.getByRole('button', { name: 'Playback options' });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    const d = (await down(page).boundingBox())!;
    const f = (await field(page).boundingBox())!;
    const u = (await up(page).boundingBox())!;
    expect(d.x + d.width).toBeLessThanOrEqual(f.x);
    expect(u.x).toBeGreaterThanOrEqual(f.x + f.width);
  });
});

test('the desktop rail stacks pitch up above the field, down below', async ({
  page,
}) => {
  await page.goto(`/notes/${seed.songId}/practice`);
  // The player renders its phone layout until it knows the viewport is
  // desktop-sized, so wait for the rail rather than measuring the swap.
  await expect
    .poll(async () => {
      const u = await up(page).boundingBox();
      const f = await field(page).boundingBox();
      const d = await down(page).boundingBox();
      return (
        !!u && !!f && !!d && u.y + u.height <= f.y && d.y >= f.y + f.height
      );
    })
    .toBe(true);
});
