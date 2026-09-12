import { redirect } from 'next/navigation';
import { PageHeader } from '../../PageHeader';
import { auth } from '@/auth';
import { BandDetailClient } from './BandDetailClient';
import { DEFAULT_BAND_TAB, isBandTab } from './bandTabs';

/**
 * Band detail. Server shell only — membership/authorization is enforced
 * by the API the client calls (`GET /api/bands/[bandId]` returns 403 for
 * non-members), so this page just guards the session and passes the id.
 */
export default async function BandDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bandId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { bandId } = await params;
  const { tab } = await searchParams;
  const currentUserId = session.user.sub ?? '';

  // Audio, Setlists and Chat used to be tabs here; keep old links and
  // bookmarks working. The first two now live on the Audio page, Chat on its
  // own.
  if (tab === 'audio') redirect(`/bands/${bandId}/audio`);
  if (tab === 'setlists') redirect(`/bands/${bandId}/audio?tab=setlists`);
  if (tab === 'chat') redirect(`/bands/${bandId}/chat`);
  // Events and Venues moved to Scheduling, which shows them for whichever
  // band is current — so these drop the band id rather than carrying it.
  if (tab === 'events') redirect('/scheduling?view=events');
  if (tab === 'venues') redirect('/scheduling?view=venues');

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" defaultHrefName="Home" />

      <BandDetailClient
        bandId={bandId}
        currentUserId={currentUserId}
        initialTab={isBandTab(tab) ? tab : DEFAULT_BAND_TAB}
        tabFromUrl={isBandTab(tab)}
      />
    </main>
  );
}
