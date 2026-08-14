'use client';

import Link from 'next/link';
import { formatDuration } from '@/lib/format';
import { LoadingBlock } from '../../../Spinner';
import { usePersistedStringSet } from '../../../usePersistedStringSet';
import { MinimizeToggle, type Conversation } from '../bandDetailShared';
import { SongRow } from './SongRow';
import { effectiveOpen, filterAlbums, unassociated } from './albumView';
import type { AlbumWithTracks } from '@/lib/db/albums';

/**
 * The Songs tab in album view: the band's albums, each collapsible, plus an
 * "Unassociated" group of songs no album claims.
 *
 * Unassociated exists so this view can't hide anything. Filing songs is the
 * reason to be here, and a song that belongs to no album would otherwise be
 * invisible in the very mode you'd use to notice it — and unreachable, since
 * you can't file what you can't see.
 */
export function BandAlbumList({
  bandId,
  albums,
  conversations,
  search,
  bandName,
  rowsDisabled,
  onAddToSetlist,
  onAddToAlbum,
  onEditSong,
  onViewSong,
  onToggleArchive,
  onDelete,
}: {
  bandId: string;
  /** Null while loading. */
  albums: AlbumWithTracks[] | null;
  conversations: Conversation[] | null;
  search: string;
  bandName: string | null;
  rowsDisabled: boolean;
  onAddToSetlist: (c: Conversation) => void;
  onAddToAlbum: (c: Conversation) => void;
  onEditSong: (c: Conversation) => void;
  onViewSong: (c: Conversation) => void;
  onToggleArchive: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  // The user's own expand/collapse choices. Search-driven expansion is layered
  // on top at render and deliberately never written here — see `effectiveOpen`.
  const [openIds, toggleOpen] = usePersistedStringSet('albumViewOpen');

  if (!albums || !conversations)
    return <LoadingBlock label="Loading albums" />;

  const groups = filterAlbums(albums, search);
  const open = effectiveOpen(groups, openIds, search);
  const active = conversations.filter((c) => !c.archived);
  const loose = unassociated(
    active.map((c) => ({ id: c.id, name: c.audioFileName ?? 'Untitled audio' })),
    albums,
    search,
  );
  const looseSongs = active.filter((c) => loose.some((l) => l.id === c.id));

  if (albums.length === 0)
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
        No albums yet. Use the ⋯ menu above to create one, then add songs to it.
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && looseSongs.length === 0 && (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
          Nothing matches “{search.trim()}”.
        </p>
      )}

      {groups.map(({ album, tracks, nameMatched }) => {
        const isOpen = open.has(album.id);
        const playable = tracks.filter((t) => t.state !== 'unplayable');
        const seconds = playable.reduce((s, t) => s + (t.songLength ?? 0), 0);
        const lost = tracks.filter((t) => t.state === 'lost').length;
        return (
          <section
            key={album.id}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <MinimizeToggle
                minimized={!isOpen}
                onToggle={() => toggleOpen(album.id)}
                label={album.name}
              >
                <h3 className="text-sm font-medium">{album.name}</h3>
              </MinimizeToggle>
              <span className="flex shrink-0 items-center gap-2 pr-2">
                {lost > 0 && (
                  <span
                    title={`${lost} track${lost === 1 ? '' : 's'} lost its chosen version`}
                    className="text-xs text-amber-700 dark:text-amber-400"
                  >
                    ⚠ {lost}
                  </span>
                )}
                <span className="text-xs minor-text-theme-colors">
                  {/* When the album matched by name the count is the whole
                      album; when songs matched it's how many did. */}
                  {tracks.length}
                  {!nameMatched && search.trim() ? ' matching' : ''}
                  {seconds > 0 ? ` · ${formatDuration(seconds)}` : ''}
                </span>
                <Link
                  href={`/bands/${bandId}/albums/${album.id}`}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open
                </Link>
              </span>
            </div>
            {isOpen && (
              <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {tracks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                      {t.position + 1}
                    </span>
                    <Link
                      href={`/notes/${t.conversationId}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.state === 'pinned' && (
                      <span className="shrink-0 truncate text-xs minor-text-theme-colors">
                        {t.pinnedLabel ?? t.pinnedFileName}
                      </span>
                    )}
                    {t.state === 'lost' && (
                      <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                        version deleted
                      </span>
                    )}
                    {t.state === 'unplayable' && (
                      <span className="shrink-0 text-xs text-neutral-500">
                        no audio
                      </span>
                    )}
                  </li>
                ))}
                {tracks.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs minor-text-theme-colors">
                    This album has no tracks yet.
                  </li>
                )}
              </ul>
            )}
          </section>
        );
      })}

      {/* Hidden entirely when empty, rather than shown as an empty group: with
          everything filed there is nothing to say. */}
      {looseSongs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium minor-text-theme-colors">
            Unassociated
          </h3>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {looseSongs.map((c) => (
              <SongRow
                key={c.id}
                c={c}
                bandName={bandName}
                disabled={rowsDisabled}
                onAddToSetlist={onAddToSetlist}
                onAddToAlbum={onAddToAlbum}
                onEdit={onEditSong}
                onView={onViewSong}
                onToggleArchive={onToggleArchive}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
