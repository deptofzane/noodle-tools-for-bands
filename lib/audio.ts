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

export type AudioEngine = {
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
  destroy: () => void;
};

export type AudioEngineOptions = {
  url: string;
  mimeType: string;
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
};

export function createAudioEngine(opts: AudioEngineOptions): AudioEngine {
  const sound = new Howl({
    src: [opts.url],
    html5: true,
    format: [mimeToFormat(opts.mimeType, opts.url)],
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

  return {
    play: () => {
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
 * Map a Drive MIME type (or filename hint) to Howler's `format` field.
 *
 * Howler uses this string to decide which decoder to attempt. It's
 * required because our streaming URL has no file extension. When the
 * MIME type is missing or generic (e.g., application/octet-stream from
 * a Drive upload that lost its metadata), we fall back to the URL's
 * extension if any, then default to mp3 as a best guess.
 */
function mimeToFormat(mime: string, url?: string): string {
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('opus')) return 'opus';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'aac';

  // Fallback: try the URL's extension (mostly for octet-stream files)
  const ext = url?.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1];
  if (ext) return ext;

  return 'mp3';
}

/** Format `seconds` as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
