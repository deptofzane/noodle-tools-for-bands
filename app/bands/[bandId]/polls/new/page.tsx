import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { PageHeader } from '../../../../PageHeader';
import { NewPollClient } from './NewPollClient';

/**
 * New-poll screen. Server shell — checks band membership, then hands off to
 * the client form. Creating notifies the band's members.
 */
export default async function NewPollPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');
  if (!(await getMembership(user.id, bandId))) notFound();

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}?tab=polls`}
        defaultHrefName="Band"
      />
      <NewPollClient bandId={bandId} />
    </main>
  );
}
