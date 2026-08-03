'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDuration } from '@/lib/format';
import {
  usePlaylistPlayer,
  type PlaylistTrack,
} from '../../../player/PlaylistPlayer';

/**
 * The Song queue tab: what the global player has lined up, in play order.
 * Reflects the live queue wherever it was built from (this page's play
 * buttons, "Add song to queue", an event's setlist), including after the bar
 * has been dismissed — playing an entry brings it back. Clicking an entry
 * jumps straight to it; "Arrange"
 * switches to drag-to-reorder rows like the setlist editor, and reordering
 * never interrupts what's playing.
 */
export function SongQueue() {
  const { queue, index, isPlaying, track, play, toggle, reorder } =
    usePlaylistPlayer();
  const [arranging, setArranging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (queue.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        Nothing queued. Use a song’s play button, or “Add song to queue” from
        its menu, to build a queue.
      </p>
    );
  }

  const known = queue.filter((t) => t.durationSec != null);
  const totalSeconds = known.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);

  // The same song can be queued twice, so the row's position — not the track
  // id — is what identifies it to the sortable list.
  const rows = queue.map((track, i) => ({ id: `${track.id}-${i}`, track }));
  const rowIds = rows.map((r) => r.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rowIds.indexOf(String(active.id));
    const to = rowIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorder(from, to);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {queue.length} {queue.length === 1 ? 'song' : 'songs'} queued
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {totalSeconds > 0 && (
            <span className="text-xs text-neutral-500">
              {known.length === queue.length ? '' : '~'}
              {formatDuration(totalSeconds)}
            </span>
          )}
          {queue.length > 1 && (
            <button
              type="button"
              onClick={() => setArranging((v) => !v)}
              aria-pressed={arranging}
              className="btn-outline"
            >
              {arranging ? 'Done' : 'Arrange'}
            </button>
          )}
        </div>
      </div>

      {arranging ? (
        <>
          <p className="text-xs text-neutral-500">
            Drag the handles to reorder. Playback keeps going.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rowIds}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <SortableQueueRow
                    key={row.id}
                    id={row.id}
                    track={row.track}
                    position={i + 1}
                    isCurrent={i === index}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rows.map(({ id: rowId, track: t }, i) => {
            const isCurrent = i === index;
            return (
              <li
                key={rowId}
                className={
                  'flex items-center gap-3 pr-3 ' +
                  (isCurrent ? 'bg-blue-50 dark:bg-blue-950/40' : '')
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    isCurrent && track ? toggle() : play(queue, i)
                  }
                  aria-label={
                    isCurrent && isPlaying
                      ? `Pause ${t.title}`
                      : `Play ${t.title}`
                  }
                  title={
                    isCurrent && isPlaying
                      ? `Pause ${t.title}`
                      : `Play ${t.title}`
                  }
                  className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  {isCurrent && isPlaying ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                  {i + 1}
                </span>

                <span className="min-w-0 flex-1 py-3 md:py-1.5">
                  {t.href ? (
                    <Link
                      href={t.href}
                      className={
                        'block truncate text-sm hover:underline ' +
                        (isCurrent
                          ? 'font-medium text-blue-700 dark:text-blue-400'
                          : '')
                      }
                    >
                      {t.title}
                    </Link>
                  ) : (
                    <span
                      className={
                        'block truncate text-sm ' +
                        (isCurrent ? 'font-medium' : '')
                      }
                    >
                      {t.title}
                    </span>
                  )}
                  {t.subtitle && (
                    <span className="block truncate text-xs text-neutral-500">
                      {t.subtitle}
                    </span>
                  )}
                </span>

                {t.durationSec != null && (
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                    {formatDuration(t.durationSec)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * A queue row while arranging: a drag handle in place of the play button,
 * styled like the setlist editor's rows. Titles aren't links here — dragging
 * and navigation don't mix.
 */
function SortableQueueRow({
  id,
  track,
  position,
  isCurrent,
}: {
  id: string;
  track: PlaylistTrack;
  position: number;
  isCurrent: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center gap-3 rounded-lg border px-3 py-3 text-sm ' +
        (isCurrent
          ? 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40'
          : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900') +
        (isDragging ? ' z-10 shadow-lg' : '')
      }
    >
      <button
        type="button"
        aria-label={`Reorder ${track.title}`}
        className="cursor-grab touch-none px-1 text-neutral-400 hover:text-neutral-700 active:cursor-grabbing dark:hover:text-neutral-200"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>

      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
        {position}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={
            'block truncate ' +
            (isCurrent
              ? 'font-medium text-blue-700 dark:text-blue-400'
              : 'font-medium')
          }
        >
          {track.title}
        </span>
        {track.subtitle && (
          <span className="block truncate text-xs text-neutral-500">
            {track.subtitle}
          </span>
        )}
      </span>

      {track.durationSec != null && (
        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
          {formatDuration(track.durationSec)}
        </span>
      )}
    </li>
  );
}
