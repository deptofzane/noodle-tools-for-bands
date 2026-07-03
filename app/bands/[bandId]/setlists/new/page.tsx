import { PageHeader } from '../../../../PageHeader';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { listBandConversations } from '@/lib/db/conversations';
import { NewSetlistClient } from './NewSetlistClient';

/**
 * New-setlist page. Server shell — checks band membership, then hands the
 * band's unarchived songs to the client builder.
 */
export default async function NewSetlistPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getMembership(user.id, bandId);
  if (!membership) notFound();

  const songs = (await listBandConversations(bandId))
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, name: c.audioFileName ?? 'Untitled audio' }));

  return (
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <PageHeader backHref={`/bands/${bandId}`} backLabel="Back to band" />

      <NewSetlistClient bandId={bandId} songs={songs} />
    </main>
  );
}
