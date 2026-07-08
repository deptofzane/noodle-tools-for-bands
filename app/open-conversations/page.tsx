import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';
import { AnnotatedList } from './AnnotatedList';
import { PageHeader } from '../PageHeader';

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
  if (session.error === 'RefreshAccessTokenError') redirect('/home');
  if (!hasAllDriveScopes(session.scopes)) redirect('/home');

  return (
    <main className="mmain-container">
      <PageHeader backHref="/home" />

      <div className="mb-4">
        <h1 className="title-text">
          Open conversations
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Conversations you&apos;re still working on. Closed ones live in{' '}
          <Link
            href="/history"
            className="text-blue-600 underline dark:text-blue-400"
          >
            History
          </Link>
          .
        </p>
      </div>

      <AnnotatedList />
    </main>
  );
}
