import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getAlbum } from '@/lib/db/albums';
import { formatDuration } from '@/lib/format';
import { PageHeader } from '../../../../PageHeader';
import { AlbumActions } from './AlbumActions';
import { AlbumTrackRow } from './AlbumTrackRow';

/**
 * View an album: its tracks in order, each resolved to the version that will
 * actually play. Server shell — the album must exist, belong to this band, and
 * the viewer must be a band member.
 */
export default async function AlbumPage({
  params,
}: {
  params: Promise<{ bandId: string; albumId: string }>;
}) {
  const { bandId, albumId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const album = await getAlbum(albumId);
  if (!album || album.bandId !== bandId) notFound();
  if (!(await getMembership(user.id, bandId))) notFound();

  // Length counts what can actually play: a track whose audio is gone
  // contributes nothing, and saying otherwise would overstate the album.
  const playable = album.tracks.filter((t) => t.state !== 'unplayable');
  const totalSeconds = playable.reduce((sum, t) => sum + (t.songLength ?? 0), 0);
  const allKnown = playable.every((t) => t.songLength != null);
  const lostCount = album.tracks.filter((t) => t.state === 'lost').length;

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}/audio?tab=songs`}
        defaultHrefName="Songs"
      />

      <span className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="title-text">{album.name}</h1>
          <p className="pb-2 text-sm minor-text-theme-colors">
            {album.tracks.length}{' '}
            {album.tracks.length === 1 ? 'track' : 'tracks'}
            {totalSeconds > 0 && (
              <>
                {' · '}
                {allKnown ? '' : '~'}
                {formatDuration(totalSeconds)}
              </>
            )}
          </p>
        </div>
        <AlbumActions album={album} />
      </span>

      {/* Said once at the top as well as per-row: someone opening an album to
          play it should learn a take is missing before pressing play, not by
          noticing the wrong recording. */}
      {lostCount > 0 && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {lostCount === 1
            ? 'One track’s chosen version was deleted; it plays the song’s current version instead.'
            : `${lostCount} tracks’ chosen versions were deleted; they play the songs’ current versions instead.`}
        </p>
      )}

      {album.tracks.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-1 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
          This album has no tracks yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200 px-2 py-1 dark:divide-neutral-800 dark:border-neutral-800">
          {album.tracks.map((t, i) => (
            <AlbumTrackRow key={t.id} album={album} track={t} index={i} />
          ))}
        </ul>
      )}
    </main>
  );
}
