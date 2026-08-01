'use client';

import Link from 'next/link';
import { formatDuration, formatSongMeta } from '@/lib/format';
import {
  usePlaylistPlayer,
  type PlaylistTrack,
} from '../../../../../player/PlaylistPlayer';
import { useBandAudioData } from '../../../bandDetailHooks';
import { audioSrc, type Conversation } from '../../../bandDetailShared';
import { dayLabel, songsForDay, timeLabel } from '../../uploadDays';
import { LoadingBlock } from '../../../../../Spinner';

/**
 * All tracks uploaded on one day, in the order they were added, playable as a
 * playlist through the global bottom-bar player. Songs added without audio
 * (created from just a name) are listed but skipped by the queue.
 */
export function UploadDayClient({
  bandId,
  day,
}: {
  bandId: string;
  day: string;
}) {
  const { data, conversations, error } = useBandAudioData(bandId);
  const player = usePlaylistPlayer();

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!data || !conversations) {
    return <LoadingBlock />;
  }

  const songs = songsForDay(conversations, day);
  const label = dayLabel(day);

  // The queue skips songs with no audio, so a row's queue position isn't its
  // row index — map by id.
  const playable = songs.filter((c) => audioSrc(c) !== null);
  const queue: PlaylistTrack[] = playable.map((c) => ({
    id: c.id,
    title: c.audioFileName ?? 'Untitled audio',
    src: audioSrc(c)!,
    fileName: c.audioStoredName ?? undefined,
    mimeType: c.audioMimeType ?? undefined,
    href: `/notes/${c.id}?from=audio`,
    subtitle: `${data.band.name} · ${label}`,
    durationSec: c.songLength ?? undefined,
  }));
  const queueIndex = (c: Conversation) =>
    playable.findIndex((p) => p.id === c.id);

  const knownLengths = playable.filter((c) => c.songLength != null);
  const totalSeconds = knownLengths.reduce(
    (sum, c) => sum + (c.songLength ?? 0),
    0,
  );

  if (songs.length === 0) {
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
            {songs.length} {songs.length === 1 ? 'track' : 'tracks'}
            {totalSeconds > 0 && (
              <>
                {' · '}
                {knownLengths.length === playable.length ? '' : '~'}
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
          disabled={queue.length === 0}
          className="shrink-0 btn-primary"
        >
          Play all
        </button>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {songs.map((c, i) => {
          const src = audioSrc(c);
          const isCurrent = player.track?.id === c.id;
          const meta = formatSongMeta(c.bpm, c.key);
          return (
            <li
              key={c.id}
              className={
                'flex items-center gap-3 px-3 py-2 ' +
                (isCurrent ? 'bg-blue-50 dark:bg-blue-950/40' : '')
              }
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                {i + 1}
              </span>

              {src ? (
                <button
                  type="button"
                  onClick={() =>
                    isCurrent
                      ? player.toggle()
                      : player.play(queue, queueIndex(c))
                  }
                  aria-label={
                    isCurrent && player.isPlaying
                      ? `Pause ${c.audioFileName ?? 'this track'}`
                      : `Play ${c.audioFileName ?? 'this track'}`
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
              ) : (
                <span
                  aria-hidden="true"
                  className="h-8 w-8 shrink-0 rounded-full border border-dashed border-neutral-300 dark:border-neutral-700"
                />
              )}

              <span className="min-w-0 flex-1">
                <Link
                  href={`/notes/${c.id}?from=audio`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {c.audioFileName ?? 'Untitled audio'}
                </Link>
                <span className="block truncate text-xs text-neutral-500">
                  {timeLabel(c.createdAt)}
                  {meta && ` · ${meta}`}
                  {!src && ' · no audio'}
                </span>
              </span>

              {c.songLength != null && (
                <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                  {formatDuration(c.songLength)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
