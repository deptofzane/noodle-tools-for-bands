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

/** One selectable audio version, for the in-player version switcher. */
export type PlayerVersion = {
  id: string;
  fileName: string;
  mimeType: string;
  label: string | null;
  isDefault: boolean;
};

type AudioPlayerProps = {
  /** URL the audio streams from (Range-capable). */
  src: string;
  fileName: string;
  mimeType: string;
  /** Stick the player to the top of the viewport while scrolling. */
  sticky?: boolean;
  /**
   * Optional multi-version support. When two or more versions are passed
   * (along with `conversationId`), the options panel shows a version
   * switcher and the player streams the selected version instead of `src`.
   */
  conversationId?: string;
  versions?: PlayerVersion[];
};

const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

/** Remembers whether the playback-options panel is expanded, across pages. */
const OPTIONS_OPEN_KEY = 'audioPlayer.optionsOpen';

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
export function AudioPlayer({
  src,
  fileName,
  mimeType,
  sticky = false,
  conversationId,
  versions,
}: AudioPlayerProps) {
  const { setEngine } = usePlayer();
  const engineRef = useRef<AudioEngine | null>(null);
  // Last play/pause toggle time, for the 100ms debounce (guards against a
  // held/repeated key or a double-tap rapidly flipping playback).
  const lastToggleRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Version switching. When versions are supplied, the player streams the
  // selected one (defaulting to the version flagged `isDefault`); otherwise
  // it falls back to the `src`/`fileName`/`mimeType` props.
  const hasVersions = Boolean(conversationId && versions && versions.length > 0);
  const [selectedVersionId, setSelectedVersionId] = useState(
    () => versions?.find((v) => v.isDefault)?.id ?? versions?.[0]?.id ?? '',
  );
  const selectedVersion = hasVersions
    ? (versions!.find((v) => v.id === selectedVersionId) ?? versions![0]!)
    : null;

  const effectiveSrc = selectedVersion
    ? `/api/conversations/${conversationId}/files/audio?version=${
        selectedVersion.id
      }&name=${encodeURIComponent(selectedVersion.fileName)}`
    : src;
  const effectiveFileName = selectedVersion
    ? selectedVersion.label || selectedVersion.fileName
    : fileName;
  const effectiveMimeType = selectedVersion ? selectedVersion.mimeType : mimeType;

  // Hydrate the panel's open/closed state from localStorage after mount.
  // Reading in a `useEffect` (rather than a lazy initializer) keeps the
  // server-rendered markup deterministic, avoiding a hydration mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem(OPTIONS_OPEN_KEY) === '1') setOptionsOpen(true);
    } catch {
      // localStorage may be unavailable (private mode / SSR); ignore.
    }
  }, []);

  const toggleOptions = useCallback(() => {
    setOptionsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(OPTIONS_OPEN_KEY, next ? '1' : '0');
      } catch {
        // Ignore persistence failures; state still updates in-memory.
      }
      return next;
    });
  }, []);

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
    // A source change (navigation OR a version switch) tears down the old
    // engine and builds a fresh, paused one — reset play state so the
    // toggle icon and the rAF tick loop don't chase a stale engine.
    setIsPlaying(false);

    const engine = createAudioEngine({
      // `src` carries a `?name=` hint so the serve route can recover a
      // concrete `audio/*` Content-Type when the stored MIME is generic
      // (Firefox mobile is strict about that header).
      url: effectiveSrc,
      mimeType: effectiveMimeType,
      fileName: effectiveFileName,
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
  }, [effectiveSrc, effectiveFileName, effectiveMimeType, setEngine]);

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
    // Debounce: ignore toggles within 100ms of the last one.
    const now = Date.now();
    if (now - lastToggleRef.current < 100) return;
    lastToggleRef.current = now;
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

  const back10 = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !isReady) return;
    const t = Math.max(0, engine.getCurrentTime() - 10);
    engine.seek(t);
    setCurrentTime(t);
  }, [isReady]);

  const forward10 = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !isReady) return;
    const max = duration || engine.getCurrentTime() + 10;
    const t = Math.min(max, engine.getCurrentTime() + 10);
    engine.seek(t);
    setCurrentTime(t);
  }, [isReady, duration]);

  // Keyboard controls: space = play/pause, → = forward 10s, ← = back 10s.
  // Ignored while a form control is focused, so typing / the seek slider /
  // selects keep their native behavior (and space still activates a focused
  // button natively — that path is debounced too via togglePlay).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        tag === 'A' ||
        t?.isContentEditable
      )
        return;
      if (e.key === ' ' || e.code === 'Space') {
        if (e.repeat) return; // don't retrigger while the key is held
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        forward10();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back10();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, forward10, back10]);

  // Apply the selected speed — on change, and again after each (re)load,
  // since a new engine starts at 1x.
  useEffect(() => {
    if (isReady) engineRef.current?.setRate(rate);
  }, [isReady, rate]);

  return (
    <div
      className={
        'rounded-lg border border-neutral-200 p-4 dark:border-neutral-800' +
        (sticky ? ' sticky top-0 z-30 bg-white dark:bg-neutral-950' : '')
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-medium">{effectiveFileName}</h2>
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

        <button
          type="button"
          onClick={toggleOptions}
          aria-expanded={optionsOpen}
          aria-controls="audio-player-options"
          aria-label="Playback options"
          title="Playback options"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={
              'transition-transform' + (optionsOpen ? ' rotate-180' : '')
            }
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {optionsOpen && (
        <div
          id="audio-player-options"
          className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800"
        >
          <button
            type="button"
            onClick={back10}
            disabled={!isReady}
            aria-label="Back 10 seconds"
            title="Back 10 seconds"
            className="flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-neutral-300 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            <span aria-hidden="true">↺</span>10s
          </button>

          <button
            type="button"
            onClick={forward10}
            disabled={!isReady}
            aria-label="Forward 10 seconds"
            title="Forward 10 seconds"
            className="flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-neutral-300 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            10s<span aria-hidden="true">↻</span>
          </button>

          <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
            Speed
            <select
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              disabled={!isReady}
              aria-label="Playback speed"
              title="Playback speed"
              className="shrink-0 rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? '100%' : `${Math.round(s * 100)}%`}
                </option>
              ))}
            </select>
          </label>

          {hasVersions && versions!.length > 1 && (
            <label className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
              Version
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                aria-label="Audio version"
                title="Audio version"
                className="min-w-0 max-w-[10rem] truncate rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
              >
                {versions!.map((v) => (
                  <option key={v.id} value={v.id}>
                    {(v.label || v.fileName) + (v.isDefault ? ' (default)' : '')}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

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
