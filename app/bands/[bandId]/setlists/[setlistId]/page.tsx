import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist } from '@/lib/db/setlists';
import { formatDuration } from '@/lib/format';
import { PageHeader } from '../../../../PageHeader';

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

  const songCount = setlist.songs.length;
  const totalSeconds = setlist.songs.reduce(
    (sum, s) => sum + (s.songLength ?? 0),
    0,
  );
  // Whether every song contributed a known length (else the total is partial).
  const allKnown = setlist.songs.every((s) => s.songLength != null);

  return (
    <main className="main-container">
      <PageHeader defaultHref={`/bands/${bandId}`} defaultHrefName="Band" canGoBack={false}>
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
            <Link
              href={`/bands/${bandId}/setlists/${setlistId}/practice`}
              className="mt-2 rounded-md border h-12 border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Practice
            </Link>
          )}
    </span>

      {setlist.songs.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          This setlist has no songs.
        </p>
      ) : (
        <ol className="flex list-decimal flex-col gap-2 rounded-lg border border-neutral-200 py-3 pl-9 pr-4 dark:border-neutral-800">
          {setlist.songs.map((s) => (
            <li key={s.conversationId}>
              <Link
                href={`/notes/${s.conversationId}`}
                className="text-sm hover:underline"
              >
                {s.audioFileName ?? 'Untitled audio'}
              </Link>
              {s['songLength'] ? (
                <span className="text-gray-400">
                  {` - ${formatDuration(s['songLength'])}`}
                </span>
              ) : (
                ''
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
