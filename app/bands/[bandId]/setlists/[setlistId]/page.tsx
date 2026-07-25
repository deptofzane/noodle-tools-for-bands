import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist } from '@/lib/db/setlists';
import { formatDuration, formatSongMeta } from '@/lib/format';
import { PageHeader } from '../../../../PageHeader';
import { SetlistOfflineButton } from './SetlistOfflineButton';

/**
 * View a setlist: its name and songs in order. Server shell — the setlist
 * must exist, belong to this band, and the viewer must be a band member.
 */
export default async function SetlistPage({
  params,
}: {
  params: Promise<{ bandId: string; setlistId: string }>;
}) {
  const { bandId, setlistId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId) notFound();
  if (!(await getMembership(user.id, bandId))) notFound();

  // Count / duration reflect actual songs, not markers (set breaks etc.).
  const playable = setlist.songs.filter((s) => s.conversationId);
  const songCount = playable.length;
  const totalSeconds = playable.reduce((sum, s) => sum + (s.songLength ?? 0), 0);
  // Whether every song contributed a known length (else the total is partial).
  const allKnown = playable.every((s) => s.songLength != null);

  // Render rows with manual song numbering so markers aren't numbered.
  let songNo = 0;
  const itemRows = setlist.songs.map((s) => {
    if (s.conversationId) {
      songNo += 1;
      return (
        <li key={s.id} className="flex items-baseline gap-3 text-sm">
          <span className="w-5 shrink-0 text-right text-xs text-neutral-400">
            {songNo}
          </span>
          <span className="min-w-0">
            <Link
              href={`/notes/${s.conversationId}`}
              className="hover:underline"
            >
              {s.name}
            </Link>
            {s.songLength ? (
              <span className="text-neutral-400">
                {` - ${formatDuration(s.songLength)}`}
              </span>
            ) : null}
            {formatSongMeta(s.bpm, s.key) && (
              <span className="text-neutral-400">
                {` · ${formatSongMeta(s.bpm, s.key)}`}
              </span>
            )}
          </span>
        </li>
      );
    }
    return (
      <li key={s.id} className="flex items-baseline gap-3">
        <span className="w-5 shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {s.name}
        </span>
      </li>
    );
  });

  return (
    <main className="main-container">
      <PageHeader defaultHref={`/bands/${bandId}`} defaultHrefName="Band">
        <span className="flex items-center gap-3">
          <Link
            href={`/bands/${bandId}/setlists/${setlistId}/edit`}
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Edit setlist
          </Link>
        </span>
      </PageHeader>
    <span className="flex justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="title-text">
          {setlist.name}
        </h1>
        <p className="text-sm text-neutral-500 pb-4">
          {songCount} {songCount === 1 ? 'song' : 'songs'}
          {songCount > 0 && (
            <>
              {' · '}
              {allKnown ? '' : '~'}
              {formatDuration(totalSeconds)}
            </>
          )}
        </p>
      </div>
          {songCount > 0 && (
            <span className="mt-2 flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Link
                href={`/bands/${bandId}/setlists/${setlistId}/practice`}
                className="btn-outline h-12 md:h-9"
              >
                Practice
              </Link>
              <Link
                href={`/bands/${bandId}/setlists/${setlistId}/practice/live`}
                className="btn-outline h-12 md:h-9"
              >
                Live
              </Link>
              <SetlistOfflineButton
                bandId={bandId}
                setlistId={setlistId}
                name={setlist.name}
                songs={setlist.songs}
              />
            </span>
          )}
    </span>

      {setlist.songs.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          This setlist has no songs.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          {itemRows}
        </ul>
      )}
    </main>
  );
}
