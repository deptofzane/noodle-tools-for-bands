'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { formatRelativeTime, formatSongMeta } from '@/lib/format';
import { useToast } from '../../../ToastProvider';
import {
  usePlaylistPlayer,
  type PlaylistTrack,
} from '../../../player/PlaylistPlayer';
import { audioSrc, type Conversation } from '../bandDetailShared';

/**
 * A single audio-track row on the band's Audio page: a play button, a link to
 * the song, and a kebab menu of actions. Playback goes through the global
 * player — Play replaces the queue with this song, "Add song to queue" appends
 * it. Songs with no audio yet keep the play button's footprint so names stay
 * aligned. Presentational otherwise — the parent supplies the handlers.
 */
export function SongRow({
  c,
  disabled,
  onAddToSetlist,
  onEdit,
  onView,
  onToggleArchive,
  onDelete,
}: {
  c: Conversation;
  disabled: boolean;
  onAddToSetlist: (c: Conversation) => void;
  onEdit: (c: Conversation) => void;
  onView: (c: Conversation) => void;
  onToggleArchive: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  const router = useRouter();
  const player = usePlaylistPlayer();
  const showToast = useToast();

  const meta = formatSongMeta(c.bpm, c.key);
  const src = audioSrc(c);
  const isCurrent = player.track?.id === c.id;

  const track: PlaylistTrack | null = src
    ? {
        id: c.id,
        title: c.audioFileName ?? 'Untitled audio',
        src,
        fileName: c.audioStoredName ?? undefined,
        mimeType: c.audioMimeType ?? undefined,
        href: `/notes/${c.id}?from=audio`,
        durationSec: c.songLength ?? undefined,
      }
    : null;

  return (
    <li className="flex items-center gap-2 pr-4 hover:bg-neutral-50 dark:hover:bg-neutral-900">
      {track ? (
        <button
          type="button"
          onClick={() =>
            isCurrent ? player.toggle() : player.play([track], 0)
          }
          aria-label={
            isCurrent && player.isPlaying
              ? `Pause ${track.title}`
              : `Play ${track.title}`
          }
          title={
            isCurrent && player.isPlaying
              ? `Pause ${track.title}`
              : `Play ${track.title}`
          }
          className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
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
          className="ml-3 h-8 w-8 shrink-0 rounded-full border border-dashed border-neutral-300 dark:border-neutral-700"
        />
      )}

      <Link
        href={`/notes/${c.id}?from=audio`}
        className="min-w-0 flex-1 px-4 py-3 md:py-1.5 md:px-3 text-sm"
      >
        <div className="flex items-center gap-2">
          <span
            className={
              'truncate font-medium ' +
              (isCurrent ? 'text-blue-700 dark:text-blue-400' : '')
            }
          >
            {c.audioFileName ?? 'Untitled audio'}
          </span>
          {c.closed && (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              closed
            </span>
          )}
        </div>
        {meta && <div className="mt-0.5 text-xs text-neutral-500">{meta}</div>}
        <div className="mt-0.5 text-xs text-neutral-500">
          Updated {formatRelativeTime(c.updatedAt)}
        </div>
      </Link>
      <ActionMenu label="Song actions" disabled={disabled}>
        {track && (
          <ActionMenuItem
            onClick={() => {
              player.enqueue([track]);
              showToast('Added to queue.', 'success');
            }}
          >
            Add song to queue
          </ActionMenuItem>
        )}
        {/* Live is sheet music on screen and nothing else, so it needs some.
            Practice pairs the player with the sheet, and is worth opening with
            either one. */}
        {c.hasSheetMusic && (
          <ActionMenuItem onClick={() => router.push(`/notes/${c.id}/live`)}>
            Live
          </ActionMenuItem>
        )}
        {(c.hasSheetMusic || track) && (
          <ActionMenuItem
            onClick={() => router.push(`/notes/${c.id}/practice`)}
          >
            Practice
          </ActionMenuItem>
        )}
        <ActionMenuItem onClick={() => onView(c)}>View song</ActionMenuItem>
        <ActionMenuItem onClick={() => onEdit(c)}>Edit song</ActionMenuItem>
        <ActionMenuItem onClick={() => onAddToSetlist(c)}>
          Add to setlist
        </ActionMenuItem>
        <ActionMenuItem onClick={() => onToggleArchive(c)}>
          {c.archived ? 'Unarchive song' : 'Archive song'}
        </ActionMenuItem>
        <ActionMenuItem destructive onClick={() => onDelete(c)}>
          Delete
        </ActionMenuItem>
      </ActionMenu>
    </li>
  );
}
