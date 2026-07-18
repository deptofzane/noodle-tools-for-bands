import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getPoll } from '@/lib/db/polls';
import { PageHeader } from '../../../../PageHeader';

/**
 * Poll detail. Server shell — the poll must belong to this band and the
 * viewer must be a member. Read-only for now (the options are shown; voting
 * is a later addition).
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

  const poll = await getPoll(pollId);
  if (!poll || poll.bandId !== bandId) notFound();

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}?tab=members`}
        defaultHrefName="Band"
        canGoBack={false}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="title-text">{poll.title}</h1>
          {poll.description && (
            <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
              {poll.description}
            </p>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {poll.options.map((o) => (
            <li
              key={o.id}
              className="rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800"
            >
              {o.text}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
