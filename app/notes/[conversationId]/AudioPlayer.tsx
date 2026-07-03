'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { createAudioEngine, type AudioEngine } from '@/lib/audio';
import { formatDuration } from '@/lib/format';
import { useTrackBoolean } from '../../PendingActionProvider';
import { usePlayer } from './PlayerContext';

type AudioPlayerProps = {
  /** URL the audio streams from (Range-capable). */
  src: string;
  fileName: string;
  mimeType: string;
};

/**
 * Client-side audio player.
 *
 * Owns one `AudioEngine` (Howler instance) for the file's lifetime in
 * this view. Uses a `requestAnimationFrame` loop while playing to
 * update the displayed current time — gentler on the CPU than a
 * `setInterval` and lines up naturally with the browser's paint cycle.
 *
 * When `externalEngineRef` is passed in (Phase 5+), the engine is also
 * exposed through that ref so the notes panel can seek to a note's
 * timestamp and read the current time when composing.
 */
export function AudioPlayer({ src, fileName, mimeType }: AudioPlayerProps) {
  const { setEngine } = usePlayer();
  const engineRef = useRef<AudioEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the global pending indicator while the audio is loading. The
  // condition flips off as soon as Howler reports readiness or an
  // error, so the spinner clears at the same moment the "Loading
  // audio…" inline message disappears.
  useTrackBoolean(!isReady && !error);

  // Spin up the engine on mount. Tear it down on unmount.
  //
  // Mobile Firefox can navigate away from the page without running
  // React's effect cleanup (e.g. swipe-back triggering bfcache, or a
  // fast page-replace before unmount). When that happens, the Howler
  // instance leaks its slot in `Howler.html5PoolSize`. After a few
  // such navigations the pool exhausts and new audio refuses to load.
  // The `pagehide` listener below catches the case where the page is
  // being fully unloaded (`persisted=false`) and forces teardown then,
  // so the slot is released. We skip teardown when `persisted=true`
  // because that means the browser is freezing the page into bfcache
  // and will restore it — destroying the engine there would break
  // playback on restoration.
  useEffect(() => {
    setIsReady(false);
    setError(null);
    setCurrentTime(0);

    const engine = createAudioEngine({
      // `src` carries a `?name=` hint so the serve route can recover a
      // concrete `audio/*` Content-Type when the stored MIME is generic
      // (Firefox mobile is strict about that header).
      url: src,
      mimeType,
      fileName,
      onReady: (dur) => {
        setDuration(dur);
        setIsReady(true);
      },
      onEnd: () => {
        setIsPlaying(false);
      },
      onError: (err) => {
        setError(
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Playback error',
        );
        setIsPlaying(false);
      },
      // Keep React state in sync after any seek — manual (slider) or
      // programmatic (note timestamp clicks via PlayerContext). Without
      // this, the rAF loop is the only thing pushing currentTime into
      // state, and it only runs while playing — so a seek-while-paused
      // would leave the seek bar visually stuck.
      onSeek: (sec) => setCurrentTime(sec),
    });
    engineRef.current = engine;
    setEngine(engine); // share with the notes panel via PlayerContext

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return;
      destroyed = true;
      engine.destroy();
      // Guarded clear: by the time a pagehide-triggered teardown runs,
      // React may have already remounted with a new engine. Don't null
      // out a ref/context that points at someone else.
      if (engineRef.current === engine) {
        engineRef.current = null;
        setEngine(null);
      }
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) teardown();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      teardown();
    };
  }, [src, fileName, mimeType, setEngine]);

  // Tick the current-time display while playing.
  //
  // Important: this loop intentionally does NOT inspect
  // `engine.isPlaying()` to decide whether to stop. During a seek
  // (slider drag or programmatic via PlayerContext), Howler's
  // underlying <audio> element briefly fires `pause` before resuming
  // at the new position. `isPlaying()` returns false for that frame
  // or two, and an earlier version of this loop would mirror that
  // into `isPlaying` state — flipping the icon to "play" even though
  // the user never paused. The source of truth for play/pause state
  // is user intent (the toggle button) plus genuine stop events
  // (`onEnd`, `onError`). The rAF loop just ticks the timestamp.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = () => {
      const engine = engineRef.current;
      if (!engine) return;
      setCurrentTime(engine.getCurrentTime());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !isReady) return;
    if (engine.isPlaying()) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.play();
      setIsPlaying(true);
    }
  }, [isReady]);

  const handleSeek = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const t = parseFloat(e.target.value);
    if (!Number.isFinite(t)) return;
    engine.seek(t);
    setCurrentTime(t);
  }, []);

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-medium">{fileName}</h2>
        <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-500">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!isReady}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-50"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            // Pause icon
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            // Play icon
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          disabled={!isReady || duration <= 0}
          className="flex-1 accent-blue-600"
          aria-label="Seek"
        />
      </div>

      {!isReady && !error && (
        <p className="mt-3 text-xs text-neutral-500">Loading audio…</p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
