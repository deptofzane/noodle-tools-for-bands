import { Howl, Howler } from 'howler';

/**
 * Audio engine wrapper.
 *
 * Thin typed API around Howler.js so the rest of the app never
 * imports Howler types directly. Two reasons:
 *   1. Keeps the audio implementation swappable (e.g., to native
 *      <audio> + MediaSource Extensions if Howler ever becomes a
 *      problem)
 *   2. Forces every consumer to think in terms of seconds and
 *      booleans, not Howler's id-based callback shape
 *
 * Critical config notes:
 *   - `html5: true` is REQUIRED. The default Howler mode loads the
 *     entire file into Web Audio API memory; fine for sound effects,
 *     a disaster for a 60-minute recording. HTML5 mode uses an
 *     <audio> element under the hood and streams via Range requests.
 *   - The format hint is also required because our proxy URL
 *     (`/api/drive/file/[fileId]/stream`) has no file extension for
 *     Howler to sniff. We pass it explicitly based on Drive's mimeType.
 */

/**
 * Raise Howler's internal HTML5 audio pool from the default of 10.
 *
 * Every Howl created with `html5: true` checks out a slot from this
 * pool. The default of 10 is plenty for a sound-effect-y app, but
 * here each navigation between audio files creates and tears down a
 * Howl. If even a handful of unloads don't cleanly return their slot
 * — which can happen when the user navigates away mid-load — the
 * pool runs out and new Howls silently fail to start streaming. On
 * mobile Firefox this surfaced as "audio stops loading after the
 * first few files."
 *
 * 30 gives us a much bigger buffer before any leaked slot becomes
 * fatal, and is paired with the stop+unload teardown in
 * `createAudioEngine` (which makes leaks much less likely in the
 * first place) and a `pagehide` listener in `AudioPlayer` (which
 * forces teardown when mobile browsers skip the React unmount path).
 *
 * Set once at module load — before any Howl is constructed.
 */
Howler.html5PoolSize = 30;

/**
 * Start playback once the browser reports it *can* play, not once it thinks it
 * can play the whole file without pausing.
 *
 * Howler decides a sound is ready in two places that disagree with each other:
 * it starts immediately when `readyState >= 3` (HAVE_FUTURE_DATA, the
 * `canplay` level), but when it has to wait it waits for `canplaythrough`
 * (readyState 4, HAVE_ENOUGH_DATA). An element parked at exactly 3 — plenty of
 * data to begin — therefore never starts. For a long rehearsal recording on a
 * slow connection, reaching 4 can take a very long time or never happen at all.
 *
 * Setting this aligns the event with the threshold Howler itself checks. It's
 * an internal field, which is part of why the Howler surface is confined to
 * this file.
 */
(Howler as unknown as { _canPlayEvent: string })._canPlayEvent = 'canplay';

/** `HTMLMediaElement.HAVE_FUTURE_DATA` — enough buffered to begin playing. */
const HAVE_FUTURE_DATA = 3;

export type AudioEngine = {
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
  /** Set playback speed (1 = normal). */
  setRate: (rate: number) => void;
  destroy: () => void;
};

export type AudioEngineOptions = {
  url: string;
  mimeType: string;
  /**
   * Original Drive filename (e.g., "recording.mp3"). Used to derive
   * the Howler format hint. We prefer the filename extension over
   * Drive's MIME type because Drive's audio MIME labels are
   * inconsistent — the same `.mp3` can come back as `audio/mpeg`,
   * `audio/mp3`, `audio/x-mpeg`, or `application/octet-stream`. Firefox
   * is stricter than Chrome about format hints aligning with the bytes
   * the decoder finds; trusting the user-visible filename gives the
   * most reliable result.
   */
  fileName?: string;
  onReady?: (durationSec: number) => void;
  onError?: (err: unknown) => void;
  onEnd?: () => void;
  /**
   * Fires after any successful seek — manual (drag the slider) OR
   * programmatic (a note click calls `engine.seek(n)` via the player
   * context). Consumers use this to sync external React state, since
   * the rAF tick-loop only runs while playing.
   */
  onSeek?: (currentSec: number) => void;
  /**
   * Fires when playback starts or stops for a reason this app didn't initiate
   * — a Bluetooth or headset control, a car head unit, an incoming call, or
   * the OS handing audio focus to another app.
   *
   * Needed because none of those go through `play()`/`pause()` here: the
   * browser acts on the underlying <audio> element directly, and Howler never
   * finds out (it listens only for `ended` and `error`, so `isPlaying()` keeps
   * reporting the last state *it* was told about). Without this, the UI's
   * play/pause button silently disagrees with what the audio is doing.
   *
   * Only external changes are reported — see `reportPlayState` for how they're
   * told apart from our own pauses and from the internal pause/play pair that
   * `Howl.seek()` performs on every scrub.
   */
  onPlayStateChange?: (playing: boolean) => void;
};

/**
 * Coalescing window for the element's play/pause events, in ms. Scrubbing can
 * emit a burst of them; this collapses each burst into one reading of the
 * element's settled state.
 */
const PLAY_STATE_SETTLE_MS = 50;

/**
 * The <audio> element Howler is driving, or null.
 *
 * `_sounds[0]._node` is private, which is exactly why this reach-in lives in
 * this file: lib/audio.ts is the one place allowed to know what's behind the
 * engine (see the header). With `html5: true` and a truthy `preload`, Howler
 * builds the Sound and obtains the node during construction, so this is
 * populated by the time `createAudioEngine` returns.
 */
function html5Node(sound: Howl): HTMLAudioElement | null {
  const sounds = (
    sound as unknown as { _sounds?: Array<{ _node?: HTMLAudioElement }> }
  )._sounds;
  return sounds?.[0]?._node ?? null;
}

export function createAudioEngine(opts: AudioEngineOptions): AudioEngine {
  const sound = new Howl({
    src: [opts.url],
    html5: true,
    format: [resolveFormat(opts.fileName, opts.mimeType, opts.url)],
    preload: 'metadata',
    onload: () => opts.onReady?.(sound.duration()),
    onloaderror: (_id, err) => opts.onError?.(err),
    onplayerror: (_id, err) => opts.onError?.(err),
    onend: () => opts.onEnd?.(),
    onseek: () => {
      const t = sound.seek();
      if (typeof t === 'number' && Number.isFinite(t)) {
        opts.onSeek?.(t);
      }
    },
  });

  /**
   * Mirror the element's real state out, but only when it's news.
   *
   * The element is paused in three different situations and only one of them
   * should reach the caller:
   *
   *   - Something outside the app paused us (Bluetooth, a phone call). Howler
   *     wasn't told, so it still reports playing while the element is paused.
   *     That disagreement is the signal, and it's the case this exists for.
   *   - We paused it ourselves. Howler's flag agrees with the element, and
   *     whoever called `pause()` has already updated its own state.
   *   - `Howl.seek()` pauses and replays the element around every position
   *     change (see its implementation). Howler's flag is set for this too, so
   *     it reads as internal — which is what keeps scrubbing from flickering
   *     the play button, however long the resume takes to buffer.
   *
   * Playing is unconditional: an element that is playing is playing, whoever
   * started it.
   */
  const node = html5Node(sound);
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Break the load deadlock before asking Howler to play.
   *
   * `preload: 'metadata'` below tells the browser to read the headers and stop
   * fetching. Howler, for its part, refuses to call `node.play()` until the
   * element has buffered (see the `_canPlayEvent` note above) — so the browser
   * is waiting to be played and Howler is waiting for it to buffer, and the
   * one action that would resolve it is the one neither will take. The song
   * sits at 0:00 with no error, because nothing has actually failed.
   *
   * It only bites sometimes: `preload` is a hint, and a small file, a fast
   * connection, or a service-worker cache hit all overshoot it and reach a
   * playable state anyway. That's also why playing the song a second time
   * appears to fix it — by then the bytes are cached.
   *
   * Promoting to `auto` is what lets the fetch continue; `load()` is what
   * restarts one the browser has already parked, since raising `preload`
   * afterwards only permits more buffering rather than guaranteeing it.
   *
   * Skipped once Howler has loaded, which is both when no deadlock is possible
   * and when `load()` would do harm: it resets `currentTime`, and a track
   * paused partway through must not restart from the top.
   */
  const primeForPlayback = () => {
    if (!node || sound.state() === 'loaded') return;
    if (node.readyState >= HAVE_FUTURE_DATA) return;
    node.preload = 'auto';
    node.load();
  };

  const reportPlayState = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (!node) return;
      if (!node.paused) opts.onPlayStateChange?.(true);
      else if (sound.playing()) opts.onPlayStateChange?.(false);
    }, PLAY_STATE_SETTLE_MS);
  };

  if (node && opts.onPlayStateChange) {
    node.addEventListener('play', reportPlayState);
    node.addEventListener('pause', reportPlayState);
  }

  return {
    /**
     * Idempotent by design. `Howl.play()` with no sound id doesn't resume an
     * already-playing Howl — it allocates a *second* sound (a second <audio>
     * element in html5 mode) and plays it alongside the first, a fraction of a
     * second offset. That's Howler behaving as documented (it's how sound
     * effects overlap), but for a single track it just sounds like distortion.
     * Callers can't always know whether they're already playing, so the guard
     * lives here rather than in each of them.
     */
    play: () => {
      if (sound.playing()) return;
      primeForPlayback();
      sound.play();
    },
    pause: () => sound.pause(),
    seek: (sec: number) => {
      sound.seek(sec);
    },
    getCurrentTime: () => {
      const t = sound.seek();
      return typeof t === 'number' && Number.isFinite(t) ? t : 0;
    },
    isPlaying: () => sound.playing(),
    setRate: (rate: number) => {
      sound.rate(rate);
    },
    /**
     * Stop, then unload. The explicit `stop()` puts Howler's HTML5
     * audio element into a clean state before `unload()` returns it
     * to the global pool. Without this, an unload that fires while
     * the underlying `<audio>` is still in a loading/playing state
     * sometimes leaks the slot — which, after a handful of
     * navigations, exhausts `Howler.html5PoolSize` and causes new
     * Howls to silently fail. The `try/catch` covers the rare case
     * where the sound was never successfully constructed.
     */
    destroy: () => {
      // Before `unload()`, which hands the element back to Howler's shared
      // html5 pool: a listener left attached would ride the recycled node into
      // whatever track is created next and report its state onto a dead engine.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
      if (node && opts.onPlayStateChange) {
        node.removeEventListener('play', reportPlayState);
        node.removeEventListener('pause', reportPlayState);
      }
      try {
        sound.stop();
      } catch {
        // never-loaded sounds can throw from stop(); safe to ignore
      }
      sound.unload();
    },
  };
}

/**
 * Resolve a Howler `format` value, preferring (in order):
 *   1. The Drive filename's extension — the most reliable signal,
 *      since users see and trust the filename, and Drive's MIME labels
 *      for audio are inconsistent enough that we shouldn't trust them
 *      as the primary source.
 *   2. The MIME type — best-effort sniffing for cases where the
 *      filename is missing or doesn't end in a recognized extension.
 *   3. The URL's extension — only useful when neither of the above
 *      yields anything (the streaming URL itself has no extension).
 *   4. `'mp3'` — last-ditch default that covers the most common case.
 *
 * Why this matters on Firefox: Chrome's media engine recovers
 * gracefully when the format hint mismatches the actual bytes; Firefox
 * mobile refuses to start playback. A wrong hint (e.g., 'mp3' for a
 * file Drive labels `application/octet-stream` but is actually an
 * m4a) breaks Firefox without breaking Chrome — exactly the
 * cross-browser disparity we've been chasing.
 */
function resolveFormat(
  fileName: string | undefined,
  mime: string,
  url?: string,
): string {
  const fromName = extensionFromName(fileName);
  if (fromName) return fromName;

  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('opus')) return 'opus';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'aac';

  const fromUrl = extensionFromName(url);
  if (fromUrl) return fromUrl;

  return 'mp3';
}

/**
 * Pull an audio extension off a filename or URL, normalizing common
 * aliases to the form Howler expects (`aif` → `aiff`, etc.). Returns
 * null when no usable audio extension is present.
 */
function extensionFromName(name: string | undefined): string | null {
  if (!name) return null;
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1];
  if (!ext) return null;
  switch (ext) {
    case 'mp3':
      return 'mp3';
    case 'm4a':
      return 'm4a';
    case 'mp4':
      return 'm4a'; // audio-only mp4 container
    case 'wav':
    case 'wave':
      return 'wav';
    case 'ogg':
    case 'oga':
      return 'ogg';
    case 'opus':
      return 'opus';
    case 'webm':
      return 'webm';
    case 'flac':
      return 'flac';
    case 'aac':
      return 'aac';
    case 'aiff':
    case 'aif':
      return 'aiff';
    default:
      return null;
  }
}
