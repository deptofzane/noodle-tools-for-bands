'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { MinimizeToggle } from '../bandDetailShared';
import type { BandUpload } from '@/lib/db/song-files';
import { dayLabel, groupByDay, timeLabel, uploadTrack } from './uploadDays';
import { usePlaylistPlayer } from '../../../player/PlaylistPlayer';

/**
 * The Uploads tab: the band's audio files grouped by the day they arrived,
 * newest day first, collapsing into one entry per day with a kebab for
 * day-level actions.
 *
 * Files, not songs: a second take of an existing song is an upload and belongs
 * here, while a song created without audio never was one. Read-only — per-song
 * actions live on the Songs tab.
 */
export function UploadHistory({
  bandId,
  uploads,
}: {
  bandId: string;
  uploads: BandUpload[] | null;
}) {
  const router = useRouter();
  const player = usePlaylistPlayer();
  /**
   * Days the user has toggled away from their default, rather than the open
   * ones. The default is "the newest day is open, older ones aren't", and the
   * day list arrives after this mounts — so there's no moment at which a set
   * of open days could be seeded. Tracking the exceptions needs no seeding.
   */
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const toggleDay = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!uploads) return null;

  if (uploads.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
        Nothing uploaded yet. Audio you add shows up here, grouped by day.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {groupByDay(uploads).map(([key, dayUploads], dayIndex) => {
        // `groupByDay` is newest first, so index 0 is the latest upload day.
        const open = (dayIndex === 0) !== toggled.has(key);
        return (
          <li
            key={key}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <MinimizeToggle
                minimized={!open}
                onToggle={() => toggleDay(key)}
                label={dayLabel(key)}
              >
                <h2 className="text-sm font-medium">{dayLabel(key)}</h2>
              </MinimizeToggle>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs minor-text-theme-colors">
                  {dayUploads.length}{' '}
                  {dayUploads.length === 1 ? 'upload' : 'uploads'}
                </span>
                <ActionMenu label={`Actions for ${dayLabel(key)}`}>
                  {/* Every row here is an audio file, so the whole day is
                    playable — no need to filter the way a setlist does. */}
                  <ActionMenuItem
                    onClick={() => player.play(dayUploads.map(uploadTrack), 0)}
                  >
                    Play all
                  </ActionMenuItem>
                  <ActionMenuItem
                    onClick={() =>
                      router.push(`/bands/${bandId}/audio/uploads/${key}`)
                    }
                  >
                    View tracks
                  </ActionMenuItem>
                </ActionMenu>
              </div>
            </div>
            {open && (
              <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {dayUploads.map((u) => (
                  <li
                    key={u.fileId}
                    className="flex items-center gap-2 pr-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <Link
                      href={`/notes/${u.conversationId}?from=audio`}
                      className="min-w-0 flex-1 px-4 py-3 text-sm md:px-3 md:py-1.5"
                    >
                      <span className="block truncate">{u.title}</span>
                      {/* The file, so two takes of one song are tellable apart. */}
                      <span className="block truncate text-xs minor-text-theme-colors">
                        {u.label || u.fileName}
                      </span>
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums minor-text-theme-colors">
                      {timeLabel(u.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
