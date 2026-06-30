import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';
import { HistoryList } from './HistoryList';

/**
 * History page — closed conversations only.
 *
 * "Open Conversations" (the default Annotated view) shows things
 * still in flight. History is the parking lot for conversations that
 * have been explicitly closed. Reading a closed conversation from here
 * does NOT reopen it — only adding a new note auto-reopens (server-side
 * via `addNoteToOwnFile`).
 */
export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.error === 'RefreshAccessTokenError') redirect('/library');
  if (!hasAllDriveScopes(session.scopes)) redirect('/library');

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
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Conversations you&apos;ve marked closed. Anything still active
          lives in{' '}
          <Link
            href="/open-conversations"
            className="text-blue-600 underline dark:text-blue-400"
          >
            Open Conversations
          </Link>
          .
        </p>
      </div>

      <HistoryList />
    </main>
  );
}
