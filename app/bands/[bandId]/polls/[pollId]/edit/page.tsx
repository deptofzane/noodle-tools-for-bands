import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getPoll } from '@/lib/db/polls';
import { PageHeader } from '../../../../../PageHeader';
import { EditPollClient } from './EditPollClient';

/**
 * Edit-poll screen. Server shell — the poll must belong to this band and the
 * viewer must be a member; then it seeds the client form.
 */
export default async function EditPollPage({
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
        defaultHref={`/bands/${bandId}/polls/${pollId}`}
        defaultHrefName="Poll"
      />
      <EditPollClient
        bandId={bandId}
        pollId={pollId}
        initialTitle={poll.title}
        initialDescription={poll.description ?? ''}
        initialOptions={poll.options.map((o) => ({ id: o.id, text: o.text }))}
      />
    </main>
  );
}
