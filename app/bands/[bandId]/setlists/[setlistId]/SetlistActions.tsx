'use client';

import { useNavigate } from '../../../../useNavigate';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../../../ActionMenu';
import { PlayShuffleRow } from '../../../../player/PlayShuffleRow';
import { useEnqueueTracks } from '../../../../player/useEnqueueTracks';
import { useShareLink } from '../../../../useShareLink';
import { LinkIcon, PencilIcon } from '../../../../icons';
import { useOfflineDownload } from '../../../../offline/useOfflineDownload';
import { setlistQueue, type Setlist } from '../../bandDetailShared';
import { OfflineBadge } from '../../../../offline/OfflineBadge';
import { usePlaylistPlayer } from '../../../../player/PlaylistPlayer';
import { shuffledCopy } from '../../../../player/queueOrder';
import { liveHref, practiceHref, setlistHref } from '@/lib/routes';

/**
 * The setlist's top actions — Play all, Practice, Live, and offline download.
 * On desktop they're individual buttons; on mobile they collapse into a single
 * kebab to save room. Both share one offline-download state (so the
 * label/progress stay in sync) and the same choose-what-to-save modal.
 */
export function SetlistActions({
  bandId,
  setlistId,
  name,
  songs,
}: {
  bandId: string;
  setlistId: string;
  name: string;
  /** The full song rows: playable enough for a queue, and a superset of what
      the offline download needs. */
  songs: Setlist['songs'];
}) {
  const go = useNavigate();
  const offline = useOfflineDownload();
  const player = usePlaylistPlayer();
  const enqueue = useEnqueueTracks();
  const share = useShareLink();

  const rec = offline.records?.get(setlistId);
  const downloading = offline.busyId === setlistId;
  const target = { bandId, setlistId, name, songs };
  const practice = practiceHref(setlistId);
  const live = liveHref(setlistId);
  const edit = `/bands/${bandId}/setlists/${setlistId}/edit`;
  // Markers (set breaks) don't count — a setlist of nothing but breaks has
  // nothing to play, practise, or download.
  const hasSongs = songs.some((s) => s.conversationId);

  // Markers and songs with no audio drop out, so this can be shorter than the
  // setlist — and empty, when nothing in it has audio yet.
  const queue = setlistQueue({ name, songs });
  const playAll = () => player.play(queue, 0);
  // A one-off scramble, not the player's shuffle mode: a setlist's order is
  // deliberate, and a mode left on would keep reordering later plays of it.
  const shuffleAll = () => player.play(shuffledCopy(queue), 0);

  return (
    <span className="mt-2 flex shrink-0 items-center justify-end gap-2">
      {/* At-a-glance offline status (all breakpoints — covers the mobile
          kebab, which can't show it while collapsed). */}
      {downloading ? (
        <span className="text-xs tabular-nums text-accent">
          ↓ {Math.round(offline.progress * 100)}%
        </span>
      ) : rec ? (
        <OfflineBadge
          downloadedAt={rec.downloadedAt}
          stale={offline.isStale({ id: setlistId, songs })}
        />
      ) : null}

      {/*
        The overflow menu, shown at every width now that it carries "Edit
        setlist" — which used to sit in the page header. On desktop that's all
        it holds, since the rest are already buttons to its left; on mobile it
        holds everything. Grouping rather than a second <ActionMenu> keeps one
        menu to open and one place for the item order.
      */}
      <ActionMenu label="Setlist actions">
        {/* No View: this is the setlist's own page. */}
        <MenuSectionLabel>Setlist</MenuSectionLabel>
        <MenuIconRow
          items={[
            {
              key: 'edit',
              icon: <PencilIcon size={18} />,
              label: `Edit ${name}`,
              title: 'Edit setlist',
              onClick: () => go(edit),
            },
            {
              key: 'share',
              icon: <LinkIcon size={18} />,
              label: `Copy a link to ${name}`,
              title: 'Share setlist',
              onClick: () =>
                void share(setlistHref(bandId, setlistId), 'Setlist'),
            },
          ]}
        />
        {/* Mobile-only: on desktop the same two actions are already buttons
            beside this menu, so repeating them inside it would be two ways to
            do one thing in the same corner of the screen. */}
        {hasSongs && queue.length > 0 && (
          <span role="none" className="block">
            <PlayShuffleRow
              label={name}
              onPlay={playAll}
              onShuffle={shuffleAll}
              onQueue={() => enqueue(queue, 'this setlist')}
            />
          </span>
        )}
        {hasSongs && (
          <span role="none" className="flex flex-col">
            <ActionMenuItem onClick={() => go(practice)}>
              Practice setlist songs
            </ActionMenuItem>
            <ActionMenuItem onClick={() => go(live)}>Live</ActionMenuItem>
            {rec ? (
              <>
                <ActionMenuItem onClick={() => offline.openDownload(target)}>
                  {downloading ? 'Downloading…' : 'Update offline copy'}
                </ActionMenuItem>
                <ActionMenuItem
                  onClick={() =>
                    void offline.remove({ bandId, setlistId, name })
                  }
                >
                  Remove offline copy
                </ActionMenuItem>
              </>
            ) : (
              <ActionMenuItem onClick={() => offline.openDownload(target)}>
                {downloading ? 'Downloading…' : 'Download for offline'}
              </ActionMenuItem>
            )}
          </span>
        )}
      </ActionMenu>

      {offline.modal}
    </span>
  );
}
