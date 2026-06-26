import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';
import { AnnotatedList } from './AnnotatedList';

/**
 * Annotated files page.
 *
 * Server shell — verifies auth and Drive scopes, then defers data
 * fetching to the `<AnnotatedList>` client component. This route is
 * heavier than other Drive endpoints (1 list + N file reads per
 * load), so we don't auto-poll it and we don't preload server-side.
 */
export default async function AnnotatedPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.error === 'RefreshAccessTokenError') redirect('/library');
  if (!hasAllDriveScopes(session.scopes)) redirect('/library');

  const currentUserSub = session.user.sub;

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
        <h1 className="text-2xl font-semibold tracking-tight">
          Open conversations
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Conversations you&apos;re still working on. Closed ones live in{' '}
          <Link
            href="/library/history"
            className="text-blue-600 underline dark:text-blue-400"
          >
            History
          </Link>
          .
        </p>
      </div>

      <AnnotatedList currentUserSub={currentUserSub} />
    </main>
  );
}
