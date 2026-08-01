import { PageHeader } from '../../../PageHeader';
import { auth } from '@/auth';
import { BandAudioClient } from './BandAudioClient';
import { isAudioTab } from './audioTabs';

/**
 * A band's Audio library. Server shell only — membership/authorization is
 * enforced by the API the client calls (`GET /api/bands/[bandId]` returns 403
 * for non-members), so this page just guards the session and passes the id.
 */
export default async function BandAudioPage({
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';

  return (
    <main className="main-container">
      <PageHeader defaultHref={`/bands/${bandId}`} defaultHrefName="Overview" />

      {/* No `?tab=` means "wherever the user left off" — the client restores
          its last tab, falling back to the Song queue. */}
      <BandAudioClient
        bandId={bandId}
        apiKey={apiKey}
        initialTab={isAudioTab(tab) ? tab : undefined}
      />
    </main>
  );
}
