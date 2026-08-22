import { PageHeader } from '../../../PageHeader';
import { auth } from '@/auth';
import { BandChatClient } from './BandChatClient';

/**
 * A band's chat. Server shell only — membership/authorization is enforced by
 * the API the client calls (`GET /api/bands/[bandId]` returns 403 for
 * non-members), so this page just guards the session and passes the id.
 *
 * Was a tab on the band page; it earns its own route because the header links
 * to it from anywhere, and a tab can only be deep-linked by teaching every
 * caller which `?tab=` to set.
 */
export default async function BandChatPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { bandId } = await params;

  return (
    <main className="main-container">
      <PageHeader defaultHref={`/bands/${bandId}`} defaultHrefName="Overview" />

      <BandChatClient bandId={bandId} currentUserId={session.user.sub ?? ''} />
    </main>
  );
}
