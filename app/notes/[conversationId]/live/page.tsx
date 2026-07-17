import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getConversationPracticeSong } from '@/lib/db/setlists';
import { Live } from '../../../Live';

/**
 * Live mode for a single song — a full-screen, chrome-free sheet-music view.
 * Same access guard as the song page; the client component takes over the
 * viewport (no app header / player).
 */
export default async function SongLivePage({
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

  return <Live songs={[song]} exitHref={`/notes/${conversationId}`} />;
}
