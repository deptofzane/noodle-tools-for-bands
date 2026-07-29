import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getConversationPracticeSong } from '@/lib/db/setlists';
import { PageHeader } from '../../../PageHeader';
import { Practice } from '../../../Practice';

/**
 * Practice a single song — the same stepper as setlist practice, but with
 * just this one item. Server shell: the viewer must be a band member for the
 * conversation; then it loads the song (audio + sheet metadata).
 */
export default async function SongPracticePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) notFound();

  const song = await getConversationPracticeSong(conversationId);
  if (!song) notFound();

  return (
    <main className="">
      <div className="px-4 py-0">
        <PageHeader
          defaultHref={`/notes/${conversationId}`}
          defaultHrefName="Song"
        />
      </div>

      <Practice songs={[song]} apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''} />
    </main>
  );
}
