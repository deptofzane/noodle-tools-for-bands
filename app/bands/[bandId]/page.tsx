import Link from 'next/link';
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
}: {
  params: Promise<{ bandId: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.error === 'RefreshAccessTokenError') redirect('/library');

  const { bandId } = await params;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';

  return (
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/bands"
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Bands
        </Link>
      </header>

      <BandDetailClient bandId={bandId} apiKey={apiKey} />
    </main>
  );
}
