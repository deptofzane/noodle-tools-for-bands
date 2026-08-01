'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDuration } from '@/lib/format';
import { FullPlayer } from './FullPlayer';
import { usePlaylistPlayer } from './PlaylistPlayer';

/**
 * The playback bar pinned to the bottom of the screen while something is
 * queued. Shows the track name and its place in the queue, a seek bar with
 * elapsed/total times, and previous / play-pause / next / expand / dismiss
 * controls. Expanding swaps the bar for the full-screen `FullPlayer`, which
 * adds the queue list. Rendered by `PlaylistPlayerProvider` — pages never
 * mount it themselves.
 */
export function MiniPlayer() {
  const [expanded, setExpanded] = useState(false);
  const {
    track,
    queue,
    index,
    isPlaying,
    currentTime,
    duration,
    error,
    toggle,
    next,
    previous,
    seek,
    close,
  } = usePlaylistPlayer();

  if (!track) return null;

  if (expanded) return <FullPlayer onCollapse={() => setExpanded(false)} />;

  const hasNext = index + 1 < queue.length;

  return (
    <div
      role="region"
      aria-label="Audio player"
      // `.player-bar` anchors it above the nav on mobile, and to the bottom
      // edge on desktop where the nav sits at the top.
      className="player-bar fixed inset-x-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2 lg:px-6">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={previous}
            aria-label="Previous song"
            title="Previous song"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M7 6h2v12H7zM19 6v12l-9-6z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggle}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={next}
            disabled={!hasNext}
            aria-label="Next song"
            title="Next song"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M15 6h2v12h-2zM5 6l9 6-9 6z" />
            </svg>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {track.href ? (
              <Link
                href={track.href}
                className="min-w-0 truncate text-sm font-medium hover:underline"
              >
                {track.title}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-sm font-medium">
                {track.title}
              </span>
            )}
            {queue.length > 1 && (
              <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                {index + 1} of {queue.length}
              </span>
            )}
          </div>

          {error ? (
            <p className="truncate text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums text-neutral-500">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                disabled={duration <= 0}
                aria-label="Seek"
                className="h-1 min-w-0 flex-1 accent-blue-600"
              />
              <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums text-neutral-500">
                {formatDuration(duration)}
              </span>
            </div>
          )}
          {track.subtitle && !error && (
            <p className="truncate text-[0.6875rem] text-neutral-500">
              {track.subtitle}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand player"
          title="Expand player"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={close}
          aria-label="Close player"
          title="Close player"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
      </div>
    </div>
  );
}
