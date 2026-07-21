import { PageHeader } from '../../PageHeader';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BandDetailClient } from './BandDetailClient';

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
  if (session.error === 'RefreshAccessTokenError') redirect('/home');

  const { bandId } = await params;
  const { tab } = await searchParams;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';
  const currentUserId = session.user.sub ?? '';

  return (
    <main className="main-container">
      <PageHeader defaultHref="/bands" />

      <BandDetailClient
        bandId={bandId}
        apiKey={apiKey}
        currentUserId={currentUserId}
        initialTab={
          tab === 'chat'
            ? 'chat'
            : tab === 'polls'
              ? 'polls'
              : tab === 'audio'
                ? 'audio'
                : 'events'
        }
      />
    </main>
  );
}
