import Link from 'next/link';
import { auth } from '@/auth';
import { AnnotatedList } from './AnnotatedList';
import { PageHeader } from '../PageHeader';

/**
 * Annotated files page.
 *
 * Server shell — verifies auth, then defers data fetching to the
 * `<AnnotatedList>` client component. Conversations live in Postgres now,
 * so this doesn't require Drive scopes. This route is heavier than most
 * (1 list + N file reads per load), so we don't auto-poll or preload it.
 */
export default async function AnnotatedPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" />

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
