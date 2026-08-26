import Link from 'next/link';
import { auth } from '@/auth';
import { HistoryClient } from './HistoryClient';
import { isHistoryTab } from './historyTabs';
import { PageHeader } from '../PageHeader';

/**
 * History page — the record of what's already finished, in three categories:
 * closed conversations, closed polls, and past events.
 *
 * "Open Conversations" (the default Annotated view) shows what's still in
 * flight. Reading a closed conversation from here does NOT reopen it — only
 * adding a new note auto-reopens (server-side via `addNoteToOwnFile`).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const { tab } = await searchParams;

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" />

      <div className="mb-4">
        <h1 className="title-text">History</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Conversations you&apos;ve closed, polls that have been decided, and
          events that have already happened. Anything still active lives in{' '}
          <Link href="/open-conversations" className="text-accent underline">
            Open Conversations
          </Link>
          .
        </p>
      </div>

      {/* No `?tab=` means "wherever you left off" — the client restores it. */}
      <HistoryClient initialTab={isHistoryTab(tab) ? tab : undefined} />
    </main>
  );
}
