'use client';

import { useRef, useState } from 'react';
import { formatDuration } from '@/lib/format';
import { FullPlayer } from './FullPlayer';
import { usePlaylistPlayer } from './PlaylistPlayer';

/** Horizontal travel that commits a drag to a track change. */
const SWIPE_PX = 56;
/** Travel before a gesture is claimed as a swipe rather than a scroll or tap. */
const CLAIM_PX = 8;
/** How far the bar follows the finger, so a long drag doesn't slide it away. */
const MAX_DRAG_PX = 96;

/**
 * The playback bar pinned to the bottom of the screen while something is
 * queued. Shows the track name, its place in the queue, playback progress,
 * and play-pause / restart / expand / dismiss controls.
 *
 * Track changes are gestures rather than buttons: swipe left for the next
 * song, right for the previous one — always a move, never a restart of what's
 * already playing, which is what the Restart button is for. Tapping the bar
 * anywhere that isn't a control expands it into the full-screen `FullPlayer`,
 * which is where next/previous stay available as real buttons for keyboard
 * and screen-reader users. Rendered by `PlaylistPlayerProvider` — pages never
 * mount it themselves.
 */
export function MiniPlayer() {
  const [expanded, setExpanded] = useState(false);
  const [dragX, setDragX] = useState(0);
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
    goTo,
    seek,
    close,
  } = usePlaylistPlayer();

  const start = useRef<{ x: number; y: number } | null>(null);
  /** The pointer we've taken capture of, once the drag reads as horizontal. */
  const captured = useRef<number | null>(null);
  /** Set when a gesture resolved to a swipe, to disarm the click it leaves. */
  const swiped = useRef(false);

  if (!track) return null;

  if (expanded) return <FullPlayer onCollapse={() => setExpanded(false)} />;

  const hasNext = index + 1 < queue.length;
  const hasPrev = index > 0;
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const endGesture = (e: React.PointerEvent) => {
    if (captured.current !== null) {
      // Guarded: releasing a capture the element no longer holds throws.
      if (e.currentTarget.hasPointerCapture(captured.current))
        e.currentTarget.releasePointerCapture(captured.current);
      captured.current = null;
    }
    start.current = null;
    setDragX(0);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || !e.isPrimary) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (captured.current === null) {
      // Undecided: a mostly-vertical drag belongs to the page's scroll, so
      // let go of it entirely rather than competing for the gesture.
      if (Math.abs(dy) > Math.abs(dx)) {
        start.current = null;
        return;
      }
      if (Math.abs(dx) < CLAIM_PX) return;
      // Committed — capture so the drag survives leaving the bar's bounds.
      e.currentTarget.setPointerCapture(e.pointerId);
      captured.current = e.pointerId;
    }
    setDragX(dx);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    const wasDragging = captured.current !== null;
    endGesture(e);
    if (!s || !e.isPrimary || !wasDragging) return;

    const dx = e.clientX - s.x;
    if (Math.abs(dx) < SWIPE_PX) return; // Short of committing — leave it be.
    swiped.current = true;
    if (dx < 0) {
      if (hasNext) next();
    } else if (hasPrev) {
      // `goTo` rather than the player's `previous`, which restarts the current
      // track once it's a few seconds in. A swipe is a request to change
      // songs; hearing the same one start over would read as a missed gesture.
      goTo(index - 1);
    }
  };

  // Runs ahead of every control in the bar: a drag that happens to end over
  // the play button should not also toggle playback, and none of them should
  // expand the player.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Clamped so the bar hints at the gesture without travelling far, and
  // damped at either end of the queue when swiping toward a track that isn't
  // there — the bar shouldn't promise a move it won't make.
  const clamped = Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, dragX));
  const blocked = clamped < 0 ? !hasNext : !hasPrev;
  const offset = blocked ? clamped / 4 : clamped;

  return (
    <div
      role="region"
      aria-label="Audio player"
      // `.player-bar` anchors it above the nav on mobile, and to the bottom
      // edge on desktop where the nav sits at the top.
      className="player-bar fixed inset-x-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      <div
        onClick={() => setExpanded(true)}
        onClickCapture={handleClickCapture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={endGesture}
        style={
          offset === 0 ? undefined : { transform: `translateX(${offset}px)` }
        }
        // `touch-pan-y` keeps vertical scrolling with the page while claiming
        // horizontal drags for the swipe. No transition mid-drag, so the bar
        // tracks the finger exactly and only animates on the way back.
        className={
          'mx-auto flex max-w-5xl cursor-pointer touch-pan-y select-none items-center gap-3 px-3 py-2 lg:px-6' +
          (dragX === 0 ? ' transition-transform duration-200' : '')
        }
      >
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500"
          >
            {isPlaying ? (
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Restart, not "previous": swiping right steps back a track, so
              starting the current one over needs its own control. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              seek(0);
            }}
            disabled={duration <= 0}
            aria-label="Restart song"
            title="Restart song"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
            >
              <path d="M3 10a9 9 0 1 1 2.64 6.36" />
              <path d="M3 4v6h6" />
            </svg>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {/* Plain text, not a link to the song: the whole bar is one tap
                target now, and a link inside it would be a trap for the
                thumb. The full player still links out to the track. */}
            <span className="min-w-0 truncate text-sm font-medium">
              {track.title}
            </span>
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
              <div
                role="progressbar"
                aria-label="Playback progress"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration) || 0}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
                className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
              >
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
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

        {/* Redundant with tapping the bar, but the only way to expand from a
            keyboard — and the visible cue that the bar opens at all. */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand player"
          title="Expand player"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
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
