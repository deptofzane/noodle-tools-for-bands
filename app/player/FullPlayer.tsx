'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDuration } from '@/lib/format';
import { ActionMenu, ActionMenuItem } from '../ActionMenu';
import { AddTrackToSetlistModal } from './AddTrackToSetlistModal';
import { usePlaylistPlayer, type PlaylistTrack } from './PlaylistPlayer';

/**
 * The maximized player: the bottom bar's contents blown up to full screen with
 * the whole queue listed underneath, any entry clickable to jump to it, and a
 * Practice link that takes the queue over to the Practice page (sheet music,
 * speed, 10s skips) — same queue, same engine, so the hand-off doesn't
 * interrupt playback.
 *
 * Mounted by `MiniPlayer` while expanded — Escape or the collapse button
 * returns to the bar, and playback is untouched either way.
 */
export function FullPlayer({ onCollapse }: { onCollapse: () => void }) {
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
    play,
    remove,
  } = usePlaylistPlayer();

  const currentRef = useRef<HTMLLIElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Queue entry whose "Add to setlist" modal is open.
  const [addTarget, setAddTarget] = useState<PlaylistTrack | null>(null);

  // Escape collapses, and the page behind shouldn't scroll under the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A dialog opened inside the overlay owns Escape — don't collapse out
      // from under it.
      if (rootRef.current?.querySelector('[role="dialog"]')) return;
      onCollapse();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCollapse]);

  // Keep the playing track visible as the queue advances.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!track) return null;

  const hasNext = index + 1 < queue.length;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Audio player"
      className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-neutral-950"
    >
      {/* Collapse is the only way out of here — dismissing the queue lives on
          the bar this collapses back to. */}
      <header className="flex shrink-0 items-center justify-end gap-2 border-b border-neutral-200 px-3 py-2 lg:px-6 dark:border-neutral-800">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse player"
          title="Collapse player"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-3 px-4 py-6">
          <div className="flex flex-col gap-1 text-center">
            {track.href ? (
              <Link
                href={track.href}
                onClick={onCollapse}
                className="truncate text-lg font-semibold hover:underline"
              >
                {track.title}
              </Link>
            ) : (
              <h2 className="truncate text-lg font-semibold">{track.title}</h2>
            )}
            {track.subtitle && (
              <p className="truncate text-sm text-neutral-500">
                {track.subtitle}
              </p>
            )}
            {queue.length > 1 && (
              <p className="text-xs tabular-nums text-neutral-500">
                {index + 1} of {queue.length}
              </p>
            )}
          </div>

          {error ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-500">
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
                className="min-w-0 flex-1 accent-blue-600"
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-500">
                {formatDuration(duration)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={previous}
              aria-label="Previous song"
              title="Previous song"
              className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 6h2v12H7zM19 6v12l-9-6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause' : 'Play'}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500"
            >
              {isPlaying ? (
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="currentColor"
                  aria-hidden="true"
                >
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
              className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M15 6h2v12h-2zM5 6l9 6-9 6z" />
              </svg>
            </button>
          </div>

          {/* Hands the queue to the Practice page — same songs, same engine,
                so playback carries straight over. */}
          <div className="flex justify-center">
            <Link
              href="/player/practice"
              onClick={onCollapse}
              className="btn-outline"
            >
              Practice
            </Link>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto w-full max-w-2xl px-4 py-3">
            <h3 className="pb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Queue
            </h3>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {queue.map((t, i) => {
                const isCurrent = i === index;
                return (
                  <li
                    key={`${t.id}-${i}`}
                    ref={isCurrent ? currentRef : null}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => play(queue, i)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={
                        'flex min-w-0 flex-1 items-center gap-3 px-2 py-3 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 ' +
                        (isCurrent ? 'text-blue-700 dark:text-blue-400' : '')
                      }
                    >
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                        {isCurrent && isPlaying ? (
                          <span aria-label="Playing" title="Playing">
                            ♪
                          </span>
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span
                        className={
                          'min-w-0 flex-1 truncate ' +
                          (isCurrent ? 'font-medium' : '')
                        }
                      >
                        {t.title}
                      </span>
                      {t.durationSec != null && (
                        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                          {formatDuration(t.durationSec)}
                        </span>
                      )}
                    </button>

                    <ActionMenu label={`Actions for ${t.title}`}>
                      <ActionMenuItem onClick={() => setAddTarget(t)}>
                        Add to setlist
                      </ActionMenuItem>
                      <ActionMenuItem onClick={() => remove(i)}>
                        Remove from queue
                      </ActionMenuItem>
                    </ActionMenu>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {addTarget && (
        <AddTrackToSetlistModal
          track={addTarget}
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  );
}
