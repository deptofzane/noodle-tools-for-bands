import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { BandsClient } from './BandsClient';

/**
 * Bands index. Server shell — verifies the session, then defers to the
 * client component for data fetching (mirrors the Open Conversations
 * page). Bands are app-internal, so no Drive scopes are required here.
 */
export default async function BandsPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.error === 'RefreshAccessTokenError') redirect('/library');

  return (
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/library"
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Library
        </Link>
      </header>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bands</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Bands group people and own conversations. Anyone in a band can see
          its audio and notes.
        </p>
      </div>

      <BandsClient />
    </main>
  );
}
