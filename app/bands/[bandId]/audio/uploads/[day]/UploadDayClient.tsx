'use client';

import Link from 'next/link';
import { formatDuration } from '@/lib/format';
import { usePlaylistPlayer } from '../../../../../player/PlaylistPlayer';
import { useBandAudioData } from '../../../bandDetailHooks';
import {
  dayLabel,
  timeLabel,
  uploadsForDay,
  uploadTrack,
} from '../../uploadDays';
import { LoadingBlock } from '../../../../../Spinner';

/**
 * Everything uploaded on one day, in the order it arrived, playable as a
 * playlist through the global bottom-bar player.
 *
 * A row is an audio *file*, not a song: two takes of the same song uploaded
 * that day are two rows, and a song added without audio isn't here at all.
 * The song names the row, the file names the line beneath it.
 */
export function UploadDayClient({
  bandId,
  day,
}: {
  bandId: string;
  day: string;
}) {
  const { data, uploads, error } = useBandAudioData(bandId);
  const player = usePlaylistPlayer();

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!data) {
    return <LoadingBlock />;
  }

  const items = uploadsForDay(uploads, day);
  const label = dayLabel(day);
  const queue = items.map(uploadTrack);

  const known = items.filter((u) => u.songLength != null);
  const totalSeconds = known.reduce((sum, u) => sum + (u.songLength ?? 0), 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="title-text">{label}</h1>
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          Nothing was uploaded on this day.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="title-text">{label}</h1>
          <p className="text-sm text-neutral-500">
            {items.length} {items.length === 1 ? 'upload' : 'uploads'}
            {totalSeconds > 0 && (
              <>
                {' · '}
                {known.length === items.length ? '' : '~'}
                {formatDuration(totalSeconds)}
              </>
            )}
            {' · '}
            {data.band.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => player.play(queue, 0)}
          className="shrink-0 btn-primary"
        >
          Play all
        </button>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {items.map((u, i) => {
          const isCurrent =
            player.track?.id === u.conversationId && player.index === i;
          return (
            <li
              key={u.fileId}
              className={
                'flex items-center gap-3 px-3 py-2 ' +
                (isCurrent ? 'bg-blue-50 dark:bg-blue-950/40' : '')
              }
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                {i + 1}
              </span>

              <button
                type="button"
                onClick={() =>
                  isCurrent ? player.toggle() : player.play(queue, i)
                }
                aria-label={
                  isCurrent && player.isPlaying
                    ? `Pause ${u.title}`
                    : `Play ${u.title}`
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                {isCurrent && player.isPlaying ? (
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

              <span className="min-w-0 flex-1">
                <Link
                  href={`/notes/${u.conversationId}?from=audio`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {u.title}
                </Link>
                <span className="block truncate text-xs text-neutral-500">
                  {u.label || u.fileName}
                  {' · '}
                  {timeLabel(u.createdAt)}
                  {!u.isDefault && ' · version'}
                </span>
              </span>

              {u.songLength != null && (
                <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                  {formatDuration(u.songLength)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
