import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getConversationPracticeSong } from '@/lib/db/setlists';
import { Practice } from '../../../Practice';

/**
 * Practice a single song — the same stepper as setlist practice, but with
 * just this one item. Server shell: the viewer must be a band member for the
 * conversation; then it loads the song (audio + sheet metadata).
 */
export default async function SongPracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  /**
   * `?thread=` opens a note thread — the link a note's "Copy link" makes.
   * `?from=` names the list this song was opened from, so Back returns there.
   */
  searchParams: Promise<{ thread?: string; from?: string }>;
}) {
  const { conversationId } = await params;
  const { thread, from } = await searchParams;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) notFound();

  const song = await getConversationPracticeSong(conversationId);
  if (!song) notFound();

  // Back to where the song was opened from — the band's Audio or Chat page,
  // or a band tab. Ported from the song page this screen replaces, which is
  // what the `?from=` on every link into a song has always been for.
  const bandId = membership.conversation.bandId;
  const bandTabs = ['overview', 'polls'];
  const back =
    from === 'audio'
      ? { href: `/bands/${bandId}/audio`, name: 'Audio' }
      : from === 'chat'
        ? { href: `/bands/${bandId}/chat`, name: 'Chat' }
        : from && bandTabs.includes(from)
          ? { href: `/bands/${bandId}?tab=${from}`, name: 'Overview' }
          : { href: `/bands/${bandId}`, name: 'Overview' };

  return (
    <main className="">
      {/* Practice renders the page header — "Edit song" in it has to follow
          whichever song you've stepped to. */}
      <Practice
        songs={[song]}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''}
        back={back}
        // This screen is the song's home, so it owns Close / Reopen. Stepping
        // a setlist doesn't — see the prop's comment.
        canCloseConversation
        // No `shareHref`: this is a server component and a function prop
        // can't cross the RSC boundary. Sharing one song is what the Share
        // icon in every kebab does; the setlist screen needs its own because
        // that URL carries the position within the set.
        initialThreadId={thread ?? null}
      />
    </main>
  );
}
