import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getPoll } from '@/lib/db/polls';
import { PageHeader } from '../../../../PageHeader';
import { PollVote } from './PollVote';

/**
 * Poll detail. Server shell — the poll must belong to this band and the
 * viewer must be a member. Loads the poll with the viewer's current vote and
 * hands off to the client voting UI.
 */
export default async function PollPage({
  params,
}: {
  params: Promise<{ bandId: string; pollId: string }>;
}) {
  const { bandId, pollId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  const poll = await getPoll(pollId, user.id);
  if (!poll || poll.bandId !== bandId) notFound();

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}?tab=polls`}
        defaultHrefName="Band"
        canGoBack={false}
      >
        {!poll.closed && (
          <Link
            href={`/bands/${bandId}/polls/${pollId}/edit`}
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Edit poll
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="title-text">{poll.title}</h1>
            {poll.closed && (
              <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                Closed
              </span>
            )}
          </div>
          {poll.description && (
            <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
              {poll.description}
            </p>
          )}
        </div>

        <PollVote
          bandId={bandId}
          pollId={poll.id}
          initialOptions={poll.options}
          initialTotal={poll.totalVotes}
          initialMyVote={poll.myVote}
          closed={poll.closed}
        />
      </div>
    </main>
  );
}
